// DotaLens launcher: app/ файлуудыг exe дотор агуулж, http://localhost:47290 дээр өөрөө serve хийгээд
// Microsoft Edge-ийн app цонхоор нээнэ. Цонх хаагдахад сервер унтарна. build.ps1-ээр compile хийнэ.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("DotaLens")]
[assembly: AssemblyDescription("Dota 2 stats and match analysis")]
[assembly: AssemblyProduct("DotaLens")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

static class Program
{
    const int Port = 47290;
    static readonly string Url = "http://localhost:" + Port + "/";
    static readonly Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
    static string ProfileDir;
    static NotifyIcon Tray;

    [STAThread]
    static void Main()
    {
        try
        {
            ProfileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DotaLens", "EdgeProfile");
            Directory.CreateDirectory(ProfileDir);

            if (AlreadyRunning()) { OpenWindow(); return; }

            Assembly asm = Assembly.GetExecutingAssembly();
            foreach (string name in asm.GetManifestResourceNames())
            {
                if (!name.StartsWith("app/")) continue;
                using (Stream s = asm.GetManifestResourceStream(name))
                using (MemoryStream ms = new MemoryStream())
                {
                    s.CopyTo(ms);
                    Files[name.Substring(4)] = ms.ToArray();
                }
            }

            HttpListener listener = new HttpListener();
            listener.Prefixes.Add(Url);
            listener.Start();
            Thread t = new Thread(() => Serve(listener));
            t.IsBackground = true;
            t.Start();

            Tray = new NotifyIcon();
            Tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Tray.Text = "DotaLens";
            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("DotaLens нээх", (s, e) => OpenWindow());
            menu.MenuItems.Add("Гарах", (s, e) => Quit());
            Tray.ContextMenu = menu;
            Tray.DoubleClick += (s, e) => OpenWindow();
            Tray.Visible = true;

            OpenWindow();

            // Edge-ийн DotaLens цонх бүгд хаагдвал програмаа унтраана.
            System.Windows.Forms.Timer watch = new System.Windows.Forms.Timer();
            watch.Interval = 5000;
            int idle = 0;
            watch.Tick += (s, e) => { if (EdgeWindowOpen()) idle = 0; else if (++idle >= 2) Quit(); };
            watch.Start();

            Application.Run();
        }
        catch (Exception e)
        {
            MessageBox.Show("DotaLens эхлүүлж чадсангүй:\n" + e.Message, "DotaLens", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static void Quit()
    {
        if (Tray != null) Tray.Visible = false;
        Application.Exit();
        Environment.Exit(0);
    }

    static bool AlreadyRunning()
    {
        try
        {
            using (WebClient wc = new WebClient())
                return wc.DownloadString(Url + "__dotalens") == "ok";
        }
        catch { return false; }
    }

    static void Serve(HttpListener l)
    {
        while (l.IsListening)
        {
            HttpListenerContext c;
            try { c = l.GetContext(); } catch { return; }
            try
            {
                string path = Uri.UnescapeDataString(c.Request.Url.AbsolutePath.TrimStart('/'));
                if (path == "") path = "index.html";
                byte[] body;
                if (path == "__dotalens") { body = System.Text.Encoding.ASCII.GetBytes("ok"); c.Response.ContentType = "text/plain"; }
                else if (Files.TryGetValue(path, out body)) { c.Response.ContentType = Mime(path); }
                else { c.Response.StatusCode = 404; body = new byte[0]; }
                c.Response.Headers["Cache-Control"] = "no-cache";
                c.Response.ContentLength64 = body.Length;
                c.Response.OutputStream.Write(body, 0, body.Length);
            }
            catch { }
            finally { try { c.Response.Close(); } catch { } }
        }
    }

    static string Mime(string p)
    {
        string ext = Path.GetExtension(p).ToLowerInvariant();
        switch (ext)
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".png": return "image/png";
            case ".svg": return "image/svg+xml";
            case ".ico": return "image/x-icon";
            default: return "application/octet-stream";
        }
    }

    static void OpenWindow()
    {
        string edge = FindEdge();
        if (edge == null) { Process.Start(Url); return; }
        string args = "--app=" + Url + " --user-data-dir=\"" + ProfileDir + "\" --no-first-run --no-default-browser-check --window-size=1400,900";
        ProcessStartInfo psi = new ProcessStartInfo(edge, args);
        psi.UseShellExecute = false;
        Process.Start(psi);
    }

    static bool EdgeWindowOpen()
    {
        try
        {
            using (ManagementObjectSearcher q = new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE Name = 'msedge.exe'"))
            {
                foreach (ManagementObject o in q.Get())
                {
                    string cl = o["CommandLine"] as string;
                    if (cl != null && cl.IndexOf(ProfileDir, StringComparison.OrdinalIgnoreCase) >= 0) return true;
                }
            }
            return false;
        }
        catch { return true; }
    }

    static string FindEdge()
    {
        const string key = @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe";
        foreach (RegistryKey hive in new[] { Registry.CurrentUser, Registry.LocalMachine })
        {
            using (RegistryKey k = hive.OpenSubKey(key))
            {
                string p = k == null ? null : k.GetValue(null) as string;
                if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
            }
        }
        string[] guesses = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
        };
        foreach (string g in guesses) if (File.Exists(g)) return g;
        return null;
    }
}

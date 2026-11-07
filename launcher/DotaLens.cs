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
[assembly: AssemblyVersion("1.3.0.0")]
[assembly: AssemblyFileVersion("1.3.0.0")]

static class Program
{
    const int Port = 47290;
    const string Version = "1.3.0";
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    static readonly string Url = "http://localhost:" + Port + "/";
    static readonly Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
    static readonly string BaseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DotaLens");
    static readonly string InstalledExe = Path.Combine(BaseDir, "DotaLens.exe");
    static string ProfileDir;
    static NotifyIcon Tray;
    static bool Background;
    static HttpListener Listener;

    [STAThread]
    static void Main(string[] argv)
    {
        try
        {
            ProfileDir = Path.Combine(BaseDir, "EdgeProfile");
            Directory.CreateDirectory(ProfileDir);
            List<string> a = new List<string>(argv);
            Background = a.Contains("--background");

            int ai = a.IndexOf("--autostart");
            if (ai >= 0 && ai + 1 < a.Count)
            {
                bool on = a[ai + 1] == "on";
                SetAutostart(on);
                if (on) Process.Start(new ProcessStartInfo(InstalledExe, "--background") { UseShellExecute = false });
                return;
            }

            string running = RunningVersion();
            if (running != null)
            {
                if (string.CompareOrdinal(running, Version) >= 0 || !AskQuit()) { if (!Background) OpenWindow(); return; }
            }

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

            Listener = new HttpListener();
            Listener.Prefixes.Add(Url);
            Listener.Start();
            Thread t = new Thread(() => Serve(Listener));
            t.IsBackground = true;
            t.Start();

            Tray = new NotifyIcon();
            Tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Tray.Text = "DotaLens — сервер ажиллаж байна";
            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("DotaLens нээх", (s, e) => OpenWindow());
            MenuItem auto = new MenuItem("Windows асахад автоматаар асах");
            auto.Checked = IsAutostart();
            auto.Click += (s, e) =>
            {
                try { SetAutostart(!auto.Checked); auto.Checked = IsAutostart(); if (auto.Checked) Background = true; }
                catch (Exception ex) { MessageBox.Show(ex.Message, "DotaLens"); }
            };
            menu.MenuItems.Add(auto);
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("Гарах", (s, e) => Quit());
            Tray.ContextMenu = menu;
            Tray.DoubleClick += (s, e) => OpenWindow();
            Tray.Visible = true;

            // Автоматаар асах тохиргоотой бол цонх хаагдсан ч сервер ажилласаар байна.
            if (IsAutostart()) Background = true;
            if (!a.Contains("--background")) OpenWindow();

            // Энгийн горимд: Edge-ийн DotaLens цонх бүгд хаагдвал програмаа унтраана.
            System.Windows.Forms.Timer watch = new System.Windows.Forms.Timer();
            watch.Interval = 5000;
            int idle = 0;
            watch.Tick += (s, e) => { if (Background || EdgeWindowOpen()) idle = 0; else if (++idle >= 2) Quit(); };
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

    /* Өөр DotaLens сервер ажиллаж байвал хувилбарыг нь буцаана ("ok" = хуучин 1.1) */
    static string RunningVersion()
    {
        try
        {
            using (WebClient wc = new WebClient())
            {
                string r = wc.DownloadString(Url + "__dotalens");
                if (r == "ok") return "1.1.0";
                return r.StartsWith("ok ") ? r.Substring(3) : null;
            }
        }
        catch { return null; }
    }

    /* Хуучин хувилбарыг унтраагаад порт сулрахыг хүлээнэ */
    static bool AskQuit()
    {
        try { using (WebClient wc = new WebClient()) wc.DownloadString(Url + "__quit"); } catch { }
        for (int i = 0; i < 20; i++) { Thread.Sleep(250); if (RunningVersion() == null) return true; }
        return false;
    }

    static bool IsAutostart()
    {
        using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
            return k != null && k.GetValue("DotaLens") != null;
    }

    static void SetAutostart(bool on)
    {
        using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
        {
            if (!on) { k.DeleteValue("DotaLens", false); return; }
            string self = Application.ExecutablePath;
            if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase))
            {
                Directory.CreateDirectory(BaseDir);
                // Суулгасан хуулбар ажиллаж байвал (файл түгжигдсэн) түүнийг зогсооно.
                foreach (Process p in Process.GetProcessesByName("DotaLens"))
                {
                    try
                    {
                        if (p.Id != Process.GetCurrentProcess().Id &&
                            string.Equals(p.MainModule.FileName, InstalledExe, StringComparison.OrdinalIgnoreCase)) { p.Kill(); p.WaitForExit(3000); }
                    }
                    catch { }
                }
                File.Copy(self, InstalledExe, true);
            }
            k.SetValue("DotaLens", "\"" + InstalledExe + "\" --background");
        }
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
                if (path == "__dotalens") { body = System.Text.Encoding.ASCII.GetBytes("ok " + Version); c.Response.ContentType = "text/plain"; }
                else if (path == "__quit" && c.Request.Headers["Origin"] == null && c.Request.Headers["Referer"] == null)
                {
                    body = new byte[0];
                    try { c.Response.Close(); } catch { }
                    try { l.Stop(); } catch { }
                    if (Tray != null) Tray.Visible = false;
                    Environment.Exit(0);
                }
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
            case ".json": return "application/json; charset=utf-8";
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

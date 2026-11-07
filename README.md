# DotaLens

Dota 2 статистик, тоглолт бүрийн алдааны дүн шинжилгээ, item зөвлөгөө өгдөг Windows desktop app.
Өгөгдлийг [OpenDota API](https://docs.opendota.com/)-аас авна.

## Боломжууд

- **Тойм** — winrate, KDA, GPM-ийн явц, хэв маягийн дүн шинжилгээ (tilt, их үхдэг баатар, соло/party гэх мэт)
- **Сүүлийн 10 — дэлгэрэнгүй** — тоглолт бүрт юу болсон, ямар алдаа гаргасан, хэрхэн үхсэн, item-ийн зуршил
- **Тоглолт бүрийн задаргаа** — үхэл бүрийн нөхцөл (тулаан / ганцаараа баригдсан), багийн тулаан бүр,
  үе шат, минут тутмын харьцуулалт, damage-ийн эх үүсвэр, gold-ын эх үүсвэр, skill build
- **Item зөвлөгөө** — тухайн тоглолтод чамд ирсэн damage-ийн төрөл, чамайг алсан баатрууд, дайсны онцлогоос
  шалтгаалан яг юу хэрэгтэй байсан, авсан/аваагүй/оройтсон
- **⚡ Live item зөвлөгөө** — баатар, роль, дайсны баатруудаа сонгоход build болон counter item гаргана
- Parse хийгдээгүй тоглолтын replay-г автоматаар задлуулна

## Ашиглах

1. [Releases](../../releases) хэсгээс `DotaLens.exe`-г татаж аваад ажиллуулна (эсвэл доор build хийнэ).
   Microsoft Edge шаардлагатай (Windows 10/11-д байдаг).
2. Friend ID, Steam профайл эсвэл Dotabuff link-ээ оруулна.
3. Dota 2 → Settings → Options → Social → **Expose Public Match Data**-г асаасан байх ёстой.

## Build

Нэмэлт суулгах зүйлгүй — Windows-ийн .NET Framework-ийн `csc.exe`-г ашиглана:

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

`dist/DotaLens.exe` үүснэ. Энэ exe нь `app/` доторх бүх файлыг агуулж, `http://localhost:47290` дээр serve хийгээд
Edge-ийн app цонхоор нээнэ. Сервер зөвхөн таны компьютер дээр ажиллана.

### Windows асахад автоматаар асах

Tray icon дээр баруун товч → **"Windows асахад автоматаар асах"**. Эсвэл:

```powershell
DotaLens.exe --autostart on    # асаах (exe-г %LOCALAPPDATA%\DotaLens руу суулгана)
DotaLens.exe --autostart off   # унтраах
```

Асаалттай үед компьютер асахад сервер арын горимд (`--background`) асаж, цонх хаагдсан ч ажилласаар байна.
Унтраалттай үед цонхоо хаахад програм өөрөө унтарна. Хуучин хувилбар ажиллаж байхад шинэ exe нээвэл хуучныг нь солино.

Хөгжүүлэлтийн үед `DotaLens.bat`-аар `app/index.html`-г шууд нээж болно.

## Dota patch гарахад

- **Өөрөө шинэчлэгддэг:** баатар, item, ability-ийн мэдээлэл (OpenDota). App нээгдэх бүрдээ одоогийн patch-ийг шалгаж,
  шинэ patch илэрвэл шууд дахин татна. Түгээмэл build, matchup, benchmark үргэлж OpenDota-гийн сүүлийн өгөгдлөөр гарна.
- **Гараар засдаг:** [`app/data.json`](app/data.json) — баатрын онцлог (heal, evasion, disable, invis гэх мэт),
  хэрэгцээ бүрийн counter item, магик damage-тай баатрууд, LH зорилт.
  App энэ файлыг GitHub-аас 6 цаг тутам шалгадаг тул **GitHub дээр засаад `version`-ийг +1 болгоход л
  бүх хэрэглэгч шинэ exe-гүйгээр шинэчлэгдэнэ.** Patch-ийн дараа хянаж дууссан бол `patch`-ийг шинэчил.
- Тохиргоо → "Patch ба өгөгдөл" хэсэгт одоогийн patch, data.json-ий хувилбар, онцлог нь тодорхойлогдоогүй шинэ баатрууд харагдана.

## Бүтэц

```
app/         Web app (HTML/CSS/JS, framework-гүй)
  app.js       Router, UI, API client
  data.json    Гараар засдаг жагсаалтууд (GitHub-аас онлайнаар шинэчлэгдэнэ)
  data.js      data.json ачаалагч
  analysis.js  Тоглолтын дүн шинжилгээ
  items.js     Тоглолтын нөхцөлд тулгуурласан item зөвлөгөө
  live.js      Live item зөвлөгөө
launcher/    C# exe launcher + icon
build.ps1    exe build хийх скрипт
```

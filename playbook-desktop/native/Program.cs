using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32;
using System.Runtime.Versioning;

[assembly: SupportedOSPlatform("windows")]

// Separate process: physical pixel coordinates, independent of Electron's DPI mode.
Native.SetProcessDpiAwarenessContext(new nint(-4));
try
{
    if (args.Length == 1 && args[0] == "launch")
    {
        var running = Process.GetProcessesByName("cs2");
        var alreadyRunning = running.Length > 0;
        foreach (var process in running) process.Dispose();
        if (alreadyRunning) throw new Exception("CS2 läuft bereits. Beende das Spiel vollständig und klicke dann erneut auf „CS2 mit lokaler Steuerung starten“. Startoptionen werden erst beim Spielstart übernommen.");
        using var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
        var steam = key?.GetValue("SteamExe") as string;
        if (string.IsNullOrWhiteSpace(steam) || !File.Exists(steam))
            throw new Exception("Steam wurde nicht gefunden. Öffne Steam einmal mit deinem Windows-Konto und versuche es erneut.");
        // Fixed arguments; no command interpreter or saved Steam options. Let
        // Windows launch the GUI without inheriting this helper's stdout pipe.
        var start = new ProcessStartInfo(steam) { UseShellExecute = true };
        foreach (var argument in new[] { "-applaunch", "730", "-console", "-vconsole", "-vconport", "29000" })
            start.ArgumentList.Add(argument);
        using var launched = Process.Start(start) ?? throw new Exception("Steam konnte CS2 nicht starten.");
        Console.WriteLine("{}");
        return;
    }
    if (args.Length != 0) throw new Exception("Unbekannte Playbook-Aktion.");
    var games = Process.GetProcessesByName("cs2").Where(p => p.MainWindowHandle != 0).ToArray();
    if (games.Length != 1) throw new Exception("Bitte genau ein CS2-Fenster öffnen.");
    using var game = games[0];
    var hwnd = game.MainWindowHandle;
    if (!Native.GetClientRect(hwnd, out var client) || !Native.GetWindowRect(hwnd, out var window))
        throw new Exception("Das CS2-Fenster konnte nicht gelesen werden.");
    var origin = new Native.Point();
    if (!Native.ClientToScreen(hwnd, ref origin)) throw new Exception("Die Spielgröße konnte nicht gelesen werden.");
    client.Left += origin.X; client.Right += origin.X; client.Top += origin.Y; client.Bottom += origin.Y;
    var visible = window;
    Native.DwmGetWindowAttribute(hwnd, 9, out visible, Marshal.SizeOf<Native.Rect>());
    Console.WriteLine(JsonSerializer.Serialize(new {
        id = hwnd.ToInt64().ToString(), identity = $"{game.Id}:{game.StartTime.ToUniversalTime().Ticks}",
        minimized = Native.IsIconic(hwnd), client = client.Json(), window = window.Json(), visible = visible.Json()
    }));
}
catch (Exception error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }

internal static class Native
{
    [StructLayout(LayoutKind.Sequential)] internal struct Rect {
        public int Left, Top, Right, Bottom;
        public readonly object Json() => new { left = Left, top = Top, right = Right, bottom = Bottom };
    }
    [StructLayout(LayoutKind.Sequential)] internal struct Point { public int X, Y; }
    [DllImport("user32.dll")] internal static extern bool SetProcessDpiAwarenessContext(nint context);
    [DllImport("user32.dll")] internal static extern bool GetClientRect(nint hwnd, out Rect rect);
    [DllImport("user32.dll")] internal static extern bool GetWindowRect(nint hwnd, out Rect rect);
    [DllImport("user32.dll")] internal static extern bool ClientToScreen(nint hwnd, ref Point point);
    [DllImport("user32.dll")] internal static extern bool IsIconic(nint hwnd);
    [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(nint hwnd, int attribute, out Rect value, int size);
}

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

// Separate process: physical pixel coordinates, independent of Electron's DPI mode.
Native.SetProcessDpiAwarenessContext(new nint(-4));
try
{
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

using System.Runtime.InteropServices;
using Microsoft.Win32;

// Only the selected hardware input's B2 assignment may be changed. B3 and monitoring stay untouched.
internal sealed class VoicemeeterMicrophone : IDisposable
{
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Simple();
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Get([MarshalAs(UnmanagedType.LPStr)] string name, out float value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Set([MarshalAs(UnmanagedType.LPStr)] string name, float value);
    private readonly nint library;
    private readonly Simple logout, dirty;
    private readonly Get get;
    private readonly Set set;
    private readonly string parameter;
    private readonly float original;
    private readonly object gate = new();
    private bool changed, disposed;
    internal bool Muted { get; private set; }
    internal VoicemeeterMicrophone(int strip)
    {
        if (strip < 0 || strip > 4) throw new Exception("Ungültiger Voicemeeter-Mikrofonkanal.");
        var directories = new List<string> { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "VB", "Voicemeeter") };
        foreach (var view in new[] { RegistryView.Registry32, RegistryView.Registry64 }) {
            using var root = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var key = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Voicemeeter");
            if (key?.GetValue("InstallLocation") is string location && Path.IsPathFullyQualified(location)) directories.Add(location);
        }
        var file = directories.Select(dir => Path.Combine(dir, "VoicemeeterRemote64.dll")).FirstOrDefault(File.Exists)
            ?? throw new Exception("Voicemeeter Remote API wurde nicht gefunden. Die Aufnahme kann ohne Mikrofonsteuerung gestartet werden.");
        library = NativeLibrary.Load(file);
        T Function<T>(string name) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(library, name));
        bool loggedIn = false;
        try {
            logout = Function<Simple>("VBVMR_Logout"); dirty = Function<Simple>("VBVMR_IsParametersDirty");
            get = Function<Get>("VBVMR_GetParameterFloat"); set = Function<Set>("VBVMR_SetParameterFloat");
            var login = Function<Simple>("VBVMR_Login")();
            loggedIn = login >= 0;
            if (login != 0) throw new Exception("Öffne Voicemeeter Potato für die Mikrofonsteuerung.");
            var type = Function<ReadType>("VBVMR_GetVoicemeeterType");
            if (type(out var kind) != 0 || kind != 3) throw new Exception("Die Mikrofonsteuerung benötigt Voicemeeter Potato.");
            parameter = $"Strip[{strip}].B2";
            Thread.Sleep(100); dirty();
            if (get(parameter, out original) != 0) throw new Exception("Der B2-Mikrofonzustand konnte nicht gelesen werden.");
            Muted = original < .5f;
        } catch {
            if (loggedIn) Function<Simple>("VBVMR_Logout")();
            NativeLibrary.Free(library); throw;
        }
    }
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ReadType(out int type);
    internal void SetMuted(bool muted)
    {
        lock (gate) {
            if (disposed) throw new Exception("Die Mikrofonsteuerung wurde beendet.");
            if (set(parameter, muted ? 0 : 1) != 0) throw new Exception("Die B2-Mikrofonzuleitung konnte nicht geändert werden.");
            changed = true;
            for (var attempt = 0; attempt < 10; attempt++) {
                Thread.Sleep(50); dirty();
                if (get(parameter, out var value) == 0 && (value < .5f) == muted) { Muted = muted; return; }
            }
            throw new Exception("Voicemeeter hat die Änderung der Mikrofonzuleitung nicht bestätigt.");
        }
    }
    public void Dispose()
    {
        lock (gate) {
            if (disposed) return;
            disposed = true;
            if (changed) {
                if (set(parameter, original) != 0) LiveAudio.Emit(new { type = "error", message = "Bitte den B2-Schalter am Mikrofon prüfen: Der ursprüngliche Zustand konnte nicht wiederhergestellt werden." });
                else Thread.Sleep(100);
            }
            logout(); NativeLibrary.Free(library);
        }
    }
}

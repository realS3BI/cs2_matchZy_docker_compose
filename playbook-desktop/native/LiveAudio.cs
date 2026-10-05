using System.Diagnostics;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;

// OS audio capture only. This helper neither launches nor modifies CS2.
internal static class LiveAudio
{
    private static readonly object OutputLock = new();
    internal static void Emit(object value) { lock (OutputLock) Console.WriteLine(JsonSerializer.Serialize(value)); }
    internal static void Recover(string directory)
    {
        if (!Path.IsPathFullyQualified(directory)) throw new Exception("Ungültiger Aufnahmespeicher.");
        foreach (var source in new[] { "game", "discord", "microphone" }) {
            double start = 0;
            var files = Directory.GetFiles(directory, source + "-*.wav")
                .Where(file => System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(file), "^(game|discord|microphone)-[0-9]+\\.wav$"));
            foreach (var wav in files.OrderBy(file => int.Parse(Path.GetFileNameWithoutExtension(file).Split('-')[1]))) {
                var sequence = int.Parse(Path.GetFileNameWithoutExtension(wav).Split('-')[1]);
                // A crash can leave stale RIFF/data sizes. Only repair this helper's own local WAV files.
                using (var stream = new FileStream(wav, FileMode.Open, FileAccess.ReadWrite)) {
                    using var reader = new BinaryReader(stream, System.Text.Encoding.UTF8, true);
                    using var writer = new BinaryWriter(stream, System.Text.Encoding.UTF8, true);
                    if (stream.Length < 44 || reader.ReadUInt32() != 0x46464952) continue;
                    stream.Position = 4; writer.Write((uint)(stream.Length - 8)); stream.Position = 12;
                    while (stream.Position + 8 <= stream.Length) {
                        var chunk = reader.ReadUInt32(); var sizePosition = stream.Position; var size = reader.ReadUInt32();
                        if (chunk == 0x61746164) { stream.Position = sizePosition; writer.Write((uint)(stream.Length - sizePosition - 4)); break; }
                        stream.Position += size + size % 2;
                    }
                }
                using var audio = new WaveFileReader(wav);
                var duration = audio.TotalTime.TotalSeconds;
                start = sequence * 30.0;
                using var converted = new MediaFoundationResampler(audio, new WaveFormat(48000, 16, source == "game" ? 2 : 1));
                var prefix = Path.Combine(directory, $"{source}-{sequence}");
                MediaFoundationEncoder.EncodeToAac(converted, prefix + ".m4a", source == "game" ? 128000 : 64000);
                File.WriteAllText(prefix + ".json", JsonSerializer.Serialize(new { type = "segment", source, sequence, start, duration }));
                converted.Dispose(); audio.Dispose(); File.Delete(wav);
            }
        }
    }
    internal static void Devices()
    {
        using var enumerator = new MMDeviceEnumerator();
        var list = new List<object>();
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active)) {
            using (device) list.Add(new { id = device.ID, name = device.FriendlyName, level = device.AudioMeterInformation.MasterPeakValue });
        }
        bool microphoneControl;
        try { using var remote = new VoicemeeterMicrophone(0); microphoneControl = true; } catch { microphoneControl = false; }
        Emit(new { devices = list, microphoneControl });
    }
    internal static async Task Run(string[] args)
    {
        if (args.Length != 4 || !Path.IsPathFullyQualified(args[0]) || args[1] == args[2] || !int.TryParse(args[3], out var strip) || strip < -1 || strip > 4)
            throw new Exception("Wähle zwei unterschiedliche Aufnahmegeräte und einen gültigen Mikrofonkanal.");
        Directory.CreateDirectory(args[0]);
        using var devices = new MMDeviceEnumerator();
        using var game = devices.GetDevice(args[1]);
        using var voice = devices.GetDevice(args[2]);
        if (game.DataFlow != DataFlow.Capture || voice.DataFlow != DataFlow.Capture || game.State != DeviceState.Active || voice.State != DeviceState.Active)
            throw new Exception("Ein ausgewähltes Aufnahmegerät ist nicht verfügbar. Es wird keine Ersatzquelle aufgenommen.");
        if (strip >= 0 && !voice.FriendlyName.Contains("Out B2", StringComparison.OrdinalIgnoreCase) && !voice.FriendlyName.Contains("Voicemeeter AUX", StringComparison.OrdinalIgnoreCase))
            throw new Exception("Die Mikrofonsteuerung ist ausschließlich für die Kommunikationsquelle B2 verfügbar.");
        using var remote = strip >= 0 ? new VoicemeeterMicrophone(strip) : null;
        using var cancel = new CancellationTokenSource();
        var origin = Stopwatch.GetTimestamp();
        var began = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        using var gameCapture = new WasapiCapture(game);
        using var voiceCapture = new WasapiCapture(voice);
        using var gameWriter = new AudioSegments(args[0], "game", gameCapture.WaveFormat, origin);
        using var voiceWriter = new AudioSegments(args[0], "discord", voiceCapture.WaveFormat, origin);
        Exception? captureError = null;
        void Attach(WasapiCapture capture, AudioSegments writer) {
            capture.DataAvailable += (_, data) => {
                try { writer.Write(data.Buffer, data.BytesRecorded, writer.Elapsed - data.BytesRecorded / (double)writer.Format.AverageBytesPerSecond); }
                catch (Exception error) { captureError = error; cancel.Cancel(); }
            };
            capture.RecordingStopped += (_, data) => { if (data.Exception != null) { captureError = data.Exception; cancel.Cancel(); } };
        }
        Attach(gameCapture, gameWriter); Attach(voiceCapture, voiceWriter);
        gameCapture.StartRecording();
        try {
            voiceCapture.StartRecording();
            Emit(new { type = "ready", startedAt = began, game = game.FriendlyName, discord = voice.FriendlyName, microphoneControl = remote != null, muted = remote?.Muted ?? false });
            _ = Task.Run(() => {
                while (!cancel.IsCancellationRequested) {
                    var line = Console.ReadLine();
                    if (line == null) { cancel.Cancel(); break; }
                    if (cancel.IsCancellationRequested) break;
                    try {
                        using var message = JsonDocument.Parse(line);
                        var action = message.RootElement.GetProperty("action").GetString();
                        if (action == "stop") cancel.Cancel();
                        else if (action == "mute") {
                            if (remote == null) throw new Exception("Voicemeeter-Mikrofonsteuerung ist nicht aktiviert.");
                            remote.SetMuted(message.RootElement.GetProperty("muted").GetBoolean());
                            Emit(new { type = "microphone", muted = remote.Muted });
                        }
                    } catch (Exception error) { Emit(new { type = "error", message = error.Message }); }
                }
            });
            while (!cancel.IsCancellationRequested && gameWriter.Elapsed < 8 * 3600) {
                await Task.Delay(250);
                if (game.State != DeviceState.Active || voice.State != DeviceState.Active) { captureError = new Exception("Ein Aufnahmegerät wurde getrennt. Die bisherigen Segmente bleiben erhalten."); break; }
                if (new DriveInfo(Path.GetPathRoot(args[0])!).AvailableFreeSpace < 128 * 1024 * 1024) { captureError = new Exception("Der lokale Aufnahmespeicher ist voll."); break; }
                gameWriter.PadSilence(); voiceWriter.PadSilence();
                Emit(new { type = "levels", game = game.AudioMeterInformation.MasterPeakValue, discord = voice.AudioMeterInformation.MasterPeakValue });
            }
        } finally {
            cancel.Cancel(); gameCapture.StopRecording(); voiceCapture.StopRecording();
            gameWriter.Complete(); voiceWriter.Complete();
        }
        if (captureError != null) Emit(new { type = "error", message = captureError.Message });
        Emit(new { type = "stopped" });
    }
}

internal sealed class AudioSegments : IDisposable
{
    internal WaveFormat Format { get; }
    internal bool Muted { get; set; }
    internal double Elapsed => (Stopwatch.GetTimestamp() - origin) / (double)Stopwatch.Frequency;
    private readonly string directory, source;
    private readonly long origin;
    private readonly object gate = new();
    private WaveFileWriter? writer;
    private long frames;
    private long segmentFrames;
    private int sequence;
    private double lastFlush;
    private bool completed;
    private readonly List<Task> encodings = new();
    internal AudioSegments(string directory, string source, WaveFormat format, long origin) { this.directory = directory; this.source = source; Format = format; this.origin = origin; }
    internal void Write(byte[] buffer, int count, double at)
    {
        lock (gate) {
            if (completed) return;
            var desired = Math.Max(0, (long)Math.Round(at * Format.SampleRate));
            if (desired > frames + Format.SampleRate / 10) WriteSilence(desired - frames);
            var skip = desired < frames - Format.SampleRate / 10 ? (int)Math.Min(count, (frames - desired) * Format.BlockAlign) : 0;
            skip -= skip % Format.BlockAlign;
            Append(Muted ? new byte[count] : buffer, skip, (count - skip) - (count - skip) % Format.BlockAlign);
            if (Elapsed - lastFlush > 1) { writer?.Flush(); lastFlush = Elapsed; }
        }
    }
    internal void PadSilence()
    {
        lock (gate) {
            if (completed) return;
            // Wait for the WASAPI buffer before filling a silent gap.
            var desired = Math.Max(0, (long)((Elapsed - .2) * Format.SampleRate));
            if (desired > frames) WriteSilence(desired - frames);
        }
    }
    private void WriteSilence(long frameCount)
    {
        var empty = new byte[Format.AverageBytesPerSecond / 10];
        while (frameCount > 0) { var next = (int)Math.Min(frameCount, empty.Length / Format.BlockAlign); Append(empty, 0, next * Format.BlockAlign); frameCount -= next; }
    }
    private void Append(byte[] data, int offset, int count)
    {
        while (count > 0) {
            writer ??= new WaveFileWriter(Path.Combine(directory, $"{source}-{sequence}.wav"), Format);
            var next = (int)Math.Min(count, (30L * Format.SampleRate - segmentFrames) * Format.BlockAlign);
            writer.Write(data, offset, next); frames += next / Format.BlockAlign; segmentFrames += next / Format.BlockAlign; count -= next; offset += next;
            if (segmentFrames == 30L * Format.SampleRate) CloseSegment();
        }
    }
    private void CloseSegment()
    {
        if (writer == null) return;
        writer.Dispose(); writer = null;
        var current = sequence++;
        var duration = segmentFrames / (double)Format.SampleRate;
        var start = (frames - segmentFrames) / (double)Format.SampleRate;
        segmentFrames = 0;
        // One background encoder per source; sequence and local manifests survive upload failures.
        var previous = encodings.LastOrDefault() ?? Task.CompletedTask;
        encodings.Add(previous.ContinueWith(_ => {
            var wav = Path.Combine(directory, $"{source}-{current}.wav");
            var output = Path.Combine(directory, $"{source}-{current}.m4a");
            try {
                using (var reader = new WaveFileReader(wav))
                using (var converted = new MediaFoundationResampler(reader, new WaveFormat(48000, 16, source == "game" ? 2 : 1))) {
                    MediaFoundationEncoder.EncodeToAac(converted, output, source == "game" ? 128000 : 64000);
                }
                var manifest = new { type = "segment", source, sequence = current, start, duration };
                File.WriteAllText(Path.Combine(directory, $"{source}-{current}.json"), JsonSerializer.Serialize(manifest));
                File.Delete(wav); LiveAudio.Emit(manifest);
            } catch { LiveAudio.Emit(new { type = "error", message = "Ein Audiosegment konnte nicht komprimiert werden. Die WAV-Datei bleibt lokal erhalten." }); }
        }, TaskScheduler.Default));
    }
    internal void Complete() { lock (gate) { if (completed) return; completed = true; CloseSegment(); } Task.WaitAll(encodings.ToArray()); }
    public void Dispose() => Complete();
}

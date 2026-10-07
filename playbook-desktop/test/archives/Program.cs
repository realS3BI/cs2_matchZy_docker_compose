using System.IO.Compression;
using System.Text;
using System.Text.Json;
using SharpCompress.Common;
using SharpCompress.Writers;
using SharpCompress.Writers.SevenZip;

var root = Path.Combine(Path.GetTempPath(), "playbook-archives-" + Guid.NewGuid());
Directory.CreateDirectory(root);
var payload = Encoding.UTF8.GetBytes("PBDEMS2\0sample demo payload for extraction tests");
try
{
    var zip = Path.Combine(root, "demos.zip");
    using (var archive = ZipFile.Open(zip, ZipArchiveMode.Create))
    {
        foreach (var name in new[] { "../outside.dem", "nested/second.dem.gz", "notes.txt" })
        {
            using var output = archive.CreateEntry(name).Open();
            output.Write(payload);
        }
    }
    Check(zip, 2);
    if (File.Exists(Path.Combine(root, "outside.dem"))) throw new Exception("Archivpfad hat den Zielordner verlassen.");

    var rar = Path.Combine(root, "demos.rar");
    // A real RAR4 archive with one stored demo; no external archiver is needed for the regression fixture.
    File.WriteAllBytes(rar, Convert.FromBase64String("UmFyIRoHAM+QcwAADQAAAAAAAADMXnQAgCkAMAAAADAAAAACJiWnAAAAAAAUMAkAIAAAAGZpcnN0LmRlbVBCREVNUzIAc2FtcGxlIGRlbW8gcGF5bG9hZCBmb3IgZXh0cmFjdGlvbiB0ZXN0cwSwewAABwA="));
    Check(rar, 1);

    var sevenZip = Path.Combine(root, "demos.7z");
    using (var output = File.Create(sevenZip))
    using (var writer = WriterFactory.OpenWriter(output, ArchiveType.SevenZip, new SevenZipWriterOptions(CompressionType.LZMA2)))
    using (var input = new MemoryStream(payload)) writer.Write("nested/first.dem", input, DateTime.UtcNow);
    Check(sevenZip, 1);
    Console.WriteLine("ZIP, RAR und 7z: Demo-Inhalte korrekt, andere Dateien übersprungen, Archivpfade bleiben im Zielordner.");
}
finally { Directory.Delete(root, true); }

void Check(string archive, int expected)
{
    var destination = Path.Combine(root, Path.GetFileNameWithoutExtension(archive) + Path.GetExtension(archive)[1..]);
    var console = Console.Out;
    using var captured = new StringWriter();
    try { Console.SetOut(captured); DemoArchives.Extract(archive, destination); }
    finally { Console.SetOut(console); }
    using var json = JsonDocument.Parse(captured.ToString());
    if (json.RootElement.GetArrayLength() != expected) throw new Exception("Falsche Anzahl extrahierter Demos.");
    foreach (var entry in json.RootElement.EnumerateArray())
    {
        var file = entry.GetProperty("path").GetString()!;
        if (Path.GetDirectoryName(file) != destination) throw new Exception("Demo liegt außerhalb des Zielordners.");
        if (!File.ReadAllBytes(file).SequenceEqual(payload)) throw new Exception("Demo-Inhalt wurde verändert.");
    }
}

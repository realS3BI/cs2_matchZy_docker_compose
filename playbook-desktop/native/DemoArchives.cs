using SharpCompress.Archives;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static class DemoArchives
{
    internal static void Extract(string source, string destination)
    {
        const long limit = 1024L * 1024 * 1024;
        if (!Path.IsPathFullyQualified(source) || !Path.IsPathFullyQualified(destination))
            throw new Exception("Ungültiger Archivpfad.");
        if (new FileInfo(source).Length > limit) throw new Exception("Das Archiv darf höchstens 1 GiB groß sein.");
        Directory.CreateDirectory(destination);
        using var archive = ArchiveFactory.OpenArchive(source);
        var demos = new List<object>();
        var inspected = 0;
        long total = 0;
        var buffer = new byte[64 * 1024];
        foreach (var entry in archive.Entries)
        {
            if (++inspected > 10000) throw new Exception("Das Archiv enthält zu viele Einträge.");
            if (entry.IsDirectory || !Regex.IsMatch(entry.Key ?? "", @"\.dem(?:\.gz|\.bz2)?$", RegexOptions.IgnoreCase)) continue;
            if (entry.IsEncrypted) throw new Exception("Passwortgeschützte Demo-Archive werden nicht unterstützt.");
            if (entry.Size > limit || demos.Count >= 100) throw new Exception("Das Archiv enthält zu große oder zu viele Demos.");
            // Archive names never become filesystem paths. Even ../ entries are written to generated filenames.
            var name = (entry.Key ?? "").Replace('\\', '/').Split('/').Last();
            var suffix = Regex.Match(name, @"\.dem(?:\.gz|\.bz2)?$", RegexOptions.IgnoreCase).Value;
            var output = Path.Combine(destination, $"{demos.Count}{suffix}");
            using var input = entry.OpenEntryStream();
            using var file = new FileStream(output, FileMode.CreateNew, FileAccess.Write);
            long bytes = 0;
            int count;
            while ((count = input.Read(buffer, 0, buffer.Length)) != 0)
            {
                bytes += count;
                total += count;
                if (bytes > limit || total > 3 * limit) throw new Exception("Das entpackte Archiv überschreitet das Größenlimit.");
                file.Write(buffer, 0, count);
            }
            demos.Add(new { name, path = output });
        }
        Console.WriteLine(JsonSerializer.Serialize(demos));
    }
}

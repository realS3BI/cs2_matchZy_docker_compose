using ValvePak;

if (args.Length != 2)
    throw new ArgumentException("Aufruf: WorkshopPack <dist-Verzeichnis> <Ausgabe.vpk>");

// Deliberately package only the compiled client assets, never local configs or credentials.
string[] paths = [
    "panorama/layout/custom_game/playbook_training.vxml_c",
    "panorama/styles/custom_game/playbook_training.vcss_c"
];
var files = paths.ToDictionary(path => path, path => File.ReadAllBytes(Path.Combine(args[0], path)));
if (files.Any(file => file.Value.Length == 0))
    throw new InvalidDataException("Ein kompiliertes HUD-Asset ist leer.");

var output = Path.GetFullPath(args[1]);
Directory.CreateDirectory(Path.GetDirectoryName(output)!);
using (var package = new Package())
{
    foreach (var (path, data) in files) package.AddFile(path, data);
    package.Write(output);
}

using var verified = new Package();
verified.Read(output);
verified.VerifyFileChecksums();
foreach (var (path, expected) in files)
{
    var entry = verified.FindEntry(path) ?? throw new InvalidDataException($"VPK-Eintrag fehlt: {path}");
    verified.ReadEntry(entry, out byte[] actual);
    if (!expected.AsSpan().SequenceEqual(actual)) throw new InvalidDataException($"VPK-Inhalt weicht ab: {path}");
}
Console.WriteLine($"Workshop-VPK erstellt und geprüft: {output}");

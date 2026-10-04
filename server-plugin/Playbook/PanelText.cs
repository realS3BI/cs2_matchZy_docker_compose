using System.Text;

namespace Playbook;

// Bounded text for the four-line HUD description area.
public static class PanelText
{
    // Let Panorama wrap to the actual label width and ellipsize at four lines.
    // Bound the network payload without splitting Unicode characters.
    public static string Description(string text)
    {
        var clean = string.Join(" ", text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        clean = new string(clean.Where(c => !char.IsControl(c)).ToArray());
        if (Encoding.UTF8.GetByteCount(clean) <= 420) return clean;
        var result = new StringBuilder();
        var bytes = 0;
        foreach (var rune in clean.EnumerateRunes())
        {
            if (bytes + rune.Utf8SequenceLength > 417) break;
            result.Append(rune.ToString());
            bytes += rune.Utf8SequenceLength;
        }
        return result.ToString().TrimEnd() + "...";
    }
}

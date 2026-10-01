using System.Text.Json;

namespace MatchZyNades;

public sealed record ThrowSample(float Time, string Position, string Velocity, string View, string Buttons);

public static class ThrowTechnique
{
    public static string Serialize(IReadOnlyList<ThrowSample> samples) => JsonSerializer.Serialize(samples);

    public static string Summarize(IReadOnlyList<ThrowSample> samples)
    {
        if (samples.Count == 0) return "Wurf im Spiel erfasst";
        var attributes = ThrowAttributes.Detect(samples);
        var labels = new List<string>();
        if (attributes.IsJumpthrow) labels.Add("Jumpthrow");
        if (attributes.IsCrouch) labels.Add("Geduckt");
        labels.Add(attributes.MovementLabel);
        labels.Add(attributes.ClickType switch { "right" => "Rechtsklick", "both" => "Beide Maustasten", _ => "Linksklick" });
        return string.Join(" · ", labels);
    }
}

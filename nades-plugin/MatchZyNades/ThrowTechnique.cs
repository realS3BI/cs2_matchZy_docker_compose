using System.Text.Json;
using CounterStrikeSharp.API;

namespace MatchZyNades;

public sealed record ThrowSample(float Time, string Position, string Velocity, string View, string Buttons);

public static class ThrowTechnique
{
    public static string Serialize(IReadOnlyList<ThrowSample> samples) => JsonSerializer.Serialize(samples);

    public static string Summarize(IReadOnlyList<ThrowSample> samples)
    {
        if (samples.Count == 0) return "Wurf im Spiel erfasst";
        var last = samples[^1].Time;
        var recent = samples.Where(s => last - s.Time <= 0.35f).ToArray();
        var actionWindow = samples.Where(s => last - s.Time <= 1.25f).ToArray();
        var pressed = recent.SelectMany(s => s.Buttons.Split(',', StringSplitOptions.TrimEntries)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var actionButtons = actionWindow.SelectMany(s => s.Buttons.Split(',', StringSplitOptions.TrimEntries)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var labels = new List<string>();
        if (actionButtons.Contains(nameof(PlayerButtons.Jump)) || actionWindow.Any(s =>
            float.TryParse(s.Velocity.Split(' ')[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var z) && z > 120))
            labels.Add("Jumpthrow");
        var crouchedDuringSetup = samples.Any(s => s.Buttons.Split(',', StringSplitOptions.TrimEntries).Contains(nameof(PlayerButtons.Duck), StringComparer.OrdinalIgnoreCase));
        if (crouchedDuringSetup && !pressed.Contains(nameof(PlayerButtons.Duck))) labels.Add("crouched then stood up");
        else if (pressed.Contains(nameof(PlayerButtons.Duck))) labels.Add("Duckthrow");
        if (pressed.Contains(nameof(PlayerButtons.Walk))) labels.Add("Walkthrow");
        if (labels.Count == 0) labels.Add("normaler Wurf");
        var positions = samples.Select(s => s.Position.Split(' ').Select(value =>
            float.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : float.NaN).ToArray())
            .Where(p => p.Length == 3 && p.All(float.IsFinite)).ToArray();
        var distance = positions.Zip(positions.Skip(1), (a, b) => MathF.Sqrt(MathF.Pow(b[0] - a[0], 2) + MathF.Pow(b[1] - a[1], 2))).Sum();
        if (distance >= 24) labels.Add(FormattableString.Invariant($"Anlauf {distance:0} Units"));
        var velocity = samples[^1].Velocity.Split(' ').Select(value =>
            float.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : 0).ToArray();
        if (velocity.Length == 3)
        {
            var speed = MathF.Sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1]);
            if (speed >= 30) labels.Add(FormattableString.Invariant($"Abwurfgeschwindigkeit {speed:0} u/s"));
        }
        return string.Join(" + ", labels);
    }
}

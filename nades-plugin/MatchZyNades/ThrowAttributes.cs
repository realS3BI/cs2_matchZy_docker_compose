using CounterStrikeSharp.API;

namespace MatchZyNades;

public sealed record ThrowAttributes(bool IsJumpthrow = false, bool IsCrouch = false, bool IsWalking = false,
    bool IsRunning = false, bool IsStepping = false, string ClickType = "left")
{
    public static readonly string[] Flags = ["is_jumpthrow", "is_crouch", "is_walking", "is_running", "is_stepping"];
    public string Movement => IsStepping ? "step" : IsWalking ? "walk" : IsRunning ? "run" : "stand";
    public string MovementLabel => Movement switch { "step" => "Schrittwurf", "walk" => "Gehen", "run" => "Laufen", _ => "Stand" };
    public ThrowAttributes Normalize() => this with { IsWalking = Movement == "walk", IsRunning = Movement == "run", IsStepping = Movement == "step" };
    public bool Flag(string field) => field switch {
        "is_jumpthrow" => IsJumpthrow, "is_crouch" => IsCrouch, "is_walking" => IsWalking,
        "is_running" => IsRunning, "is_stepping" => IsStepping, _ => false
    };

    public static ThrowAttributes Detect(IReadOnlyList<ThrowSample> samples)
    {
        if (samples.Count == 0) return new();
        var last = samples[^1].Time;
        var recent = samples.Where(s => last - s.Time <= 0.35f).ToArray();
        var action = samples.Where(s => last - s.Time <= 1.25f).ToArray();
        bool Pressed(IEnumerable<ThrowSample> window, PlayerButtons button) => window.Any(s => Buttons(s).Contains(button.ToString()));
        var moving = recent.Any(s => Coordinates.TryParse(s.Velocity, out var v) && v.X * v.X + v.Y * v.Y >= 30 * 30);
        var walk = Pressed(recent, PlayerButtons.Walk);
        var distance = action.Select(s => Coordinates.TryParse(s.Position, out var p) ? (Coordinates?)p : null)
            .Where(p => p.HasValue).Select(p => p!.Value).ToArray();
        var travel = distance.Zip(distance.Skip(1), (a, b) => MathF.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y))).Sum();
        // Use the last held attack combination before release, not a union across setup.
        var attack = samples.LastOrDefault(s => Buttons(s).Contains(nameof(PlayerButtons.Attack)) || Buttons(s).Contains(nameof(PlayerButtons.Attack2)));
        var held = attack == null ? new HashSet<string>() : Buttons(attack);
        var left = held.Contains(nameof(PlayerButtons.Attack));
        var right = held.Contains(nameof(PlayerButtons.Attack2));
        var stepping = moving && travel >= 4 && travel < 24;
        return new(Pressed(recent, PlayerButtons.Jump) || recent.Any(s => Coordinates.TryParse(s.Velocity, out var v) && v.Z > 120),
            Buttons(samples[^1]).Contains(nameof(PlayerButtons.Duck)), moving && walk && !stepping, moving && !walk && !stepping, stepping,
            left && right ? "both" : right ? "right" : "left");
    }

    private static HashSet<string> Buttons(ThrowSample sample) => sample.Buttons.Split(',', StringSplitOptions.TrimEntries)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);
}

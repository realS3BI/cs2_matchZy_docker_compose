namespace Playbook;

public static class DamageFeedback
{
    public static string Hit(string victim, int damage, int hitGroup, int health) => HitGroup(hitGroup) is { } zone
        ? $"{victim}: {damage} Schaden ({zone}), {health} HP verbleibend."
        : $"{victim}: {damage} Schaden, {health} HP verbleibend.";

    // CS2 hit groups as reported by player_hurt.
    public static string? HitGroup(int hitGroup) => hitGroup switch
    {
        1 => "Kopf", 2 => "Brust", 3 => "Bauch", 4 => "linker Arm", 5 => "rechter Arm",
        6 => "linkes Bein", 7 => "rechtes Bein", 8 => "Hals", _ => null,
    };
}

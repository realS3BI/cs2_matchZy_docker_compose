using System.Globalization;

namespace MatchZyNades;

public static class ReviewEffectTarget
{
    public static Coordinates? Resolve(NadeLineup lineup, IEnumerable<NadeCapture>? captures)
    {
        var target = lineup.LandingPosition;
        var hasRevision = DateTimeOffset.TryParse(lineup.Revision, CultureInfo.InvariantCulture, DateTimeStyles.None, out var newest);
        foreach (var capture in captures ?? [])
        {
            if (capture == null || capture.Owner != lineup.Owner || capture.Map != lineup.Map || capture.Name != lineup.Name ||
                !Coordinates.TryParse(capture.LineupPos, out var start) || !Same(start, lineup.Position) ||
                !Coordinates.TryParse(capture.LineupAng, out var angles) || !Same(angles, lineup.Angles) ||
                !Coordinates.TryParse(capture.LandingPos, out var landing) ||
                !DateTimeOffset.TryParse(capture.CapturedAt, CultureInfo.InvariantCulture, DateTimeStyles.None, out var measured) ||
                hasRevision && measured < newest) continue;
            target = landing;
            newest = measured;
            hasRevision = true;
        }
        return target;
    }

    private static bool Same(Coordinates a, Coordinates b) =>
        Math.Abs(a.X - b.X) < 0.001f && Math.Abs(a.Y - b.Y) < 0.001f && Math.Abs(a.Z - b.Z) < 0.001f;
}

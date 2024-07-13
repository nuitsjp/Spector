using NAudio.Wave;
using UnitGenerator;

namespace Spector.Model;

public record RecordingConfig(
    TimeSpan RecordingSpan,
    RefreshRate RefreshRate)
{
    public static readonly RecordingConfig Default =
        new(TimeSpan.FromMinutes(2), new RefreshRate(40));

    public int RecordingLength => (int)(RecordingSpan / RefreshRate.Interval);
}

[UnitOf<int>]
public partial struct RefreshRate
{
    public TimeSpan Interval => TimeSpan.FromSeconds(1f / value);
}
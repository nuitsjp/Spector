namespace Spector.Model;

/// <summary>
/// MicrophoneLevelLoggerの各種設定
/// </summary>
public record Settings(
    string RecorderHost,
    DeviceId? RecordDeviceId,
    DeviceId? PlaybackDeviceId, 
    bool EnableAWeighting,
    bool EnableFastTimeWeighting,
    Settings.RecorderSettings Recorder,
    IReadOnlyList<Settings.DeviceSettings> Devices,
    IReadOnlyList<CalibrationPoint> CalibrationPoints)
{
    public bool TryGetDeviceSettings(DeviceId id, out DeviceSettings deviceSettings)
    {
        var config = Devices.SingleOrDefault(x => x.Id == id);
        deviceSettings = config!;
        return config is not null;
    }

    public record RecorderSettings(
        TimeSpan RecordingSpan,
        string OutputDirectory,
        bool WithVoice,
        bool WithBuzz);

    public record DeviceSettings(
        DeviceId Id,
        string Name,
        bool Measure);
}

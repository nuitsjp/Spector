namespace Spector.Model;

/// <summary>
/// MicrophoneLevelLoggerの各種設定
/// </summary>
public record Settings(
    string RecorderHost,
    TimeSpan RecordingSpan,
    DeviceId? RecordDeviceId,
    DeviceId? PlaybackDeviceId, 
    bool EnableAWeighting,
    bool EnableFastTimeWeighting,
    IReadOnlyList<DeviceSettings> DeviceSettings)
{
    public bool TryGetDeviceSettings(DeviceId id, out DeviceSettings deviceSettings)
    {
        var config = DeviceSettings.SingleOrDefault(x => x.Id == id);
        deviceSettings = config!;
        return config is not null;
    }

    public DeviceSettings GetDeviceSettings(DeviceId id)
    {
        return DeviceSettings.Single(x => x.Id == id);
    }
}
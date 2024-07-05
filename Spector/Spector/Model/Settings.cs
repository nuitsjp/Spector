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
    RecorderSettings RecorderSettings,
    IReadOnlyList<DeviceSettings> DeviceSettings)
{
    public bool TryGetDeviceSettings(DeviceId id, out DeviceSettings deviceSettings)
    {
        var config = DeviceSettings.SingleOrDefault(x => x.Id == id);
        deviceSettings = config!;
        return config is not null;
    }
}

public record RecorderSettings(
    TimeSpan RecordingSpan,
    bool WithVoice,
    bool WithBuzz);
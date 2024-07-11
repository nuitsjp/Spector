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
    IReadOnlyList<Settings.DeviceSettings> Device)
{
    public bool TryGetDeviceSettings(DeviceId id, out DeviceSettings deviceSettings)
    {
        var config = Device.SingleOrDefault(x => x.Id == id);
        deviceSettings = config!;
        return config is not null;
    }

    public record RecorderSettings(
        TimeSpan RecordingSpan,
        string OutputDirectory,
        bool WithVoice,
        bool WithBuzz);
    public class DeviceSettings(
        DeviceId id,
        string name,
        bool measure)
    {
        /// <summary>
        /// ID
        /// </summary>
        public DeviceId Id { get; } = id;

        /// <summary>
        /// 名称
        /// </summary>
        public string Name { get; set; } = name;

        /// <summary>
        /// 計測するか、しないか取得する。
        /// </summary>
        public bool Measure { get; set; } = measure;
    }
}

using NAudio.CoreAudioApi;
using NAudio.Wave.SampleProviders;
using NAudio.Wave;
using Reactive.Bindings;

namespace Spector.Model;

public class AudioInterface(ISettingsRepository settingsRepository)
{
    private Settings Settings { get; set; } = default!;
    private readonly ReactiveCollection<IDevice> _devices = new();

    public ReadOnlyReactiveCollection<IDevice> Devices => _devices.ToReadOnlyReactiveCollection();

    public async Task ActivateAsync()
    {
        Settings = await settingsRepository.LoadAsync();
        await LoadDevicesAsync();
    }

    /// <summary>
    /// すべてのマイクをロードする。
    /// </summary>
    /// <returns></returns>
    private async Task LoadDevicesAsync()
    {
        using var enumerator = new MMDeviceEnumerator();
        var mmDevices = enumerator
            .EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active)
            .ToList();

        // 新しく接続されたデバイスの確認
        var connectedDevices = mmDevices
            .Where(mmDevice => _devices.NotContains(device => device.Id.AsPrimitive() == mmDevice.ID));
        foreach (var mmDevice in connectedDevices)
        {
            var device = await ResolveDeviceAsync(mmDevice);
            _devices.Add(device);
        }

        // 切断されたデバイスの確認
        var disconnectedDevices = _devices
            .Where(device => mmDevices.NotContains(mmDevice => device.Id.AsPrimitive() == mmDevice.ID))
            .ToList(); // _devicesから作成しているので、いったん別のListにしないとRemove時にエラーとなるので詰め替えておく
        foreach (var device in disconnectedDevices)
        {
            _devices.Remove(device);
            device.Dispose();
        }
    }

    private async Task<IDevice> ResolveDeviceAsync(MMDevice mmDevice)
    {
        var deviceId = new DeviceId(mmDevice.ID);

        // 新たに接続されたデバイスった場合
        if (Settings.TryGetDeviceSettings(deviceId, out _) is false)
        {
            var deviceSettings = new DeviceSettings(deviceId, mmDevice.FriendlyName, true);
            List<DeviceSettings> deviceConfigs = Settings.DeviceSettings.ToList();
            deviceConfigs.Add(deviceSettings);
            Settings = Settings with { DeviceSettings = deviceConfigs };
            await settingsRepository.SaveAsync(Settings);
        }

        var captureDevice = new CaptureDevice(mmDevice);
        captureDevice.StartRecording();
        return captureDevice;
    }

}
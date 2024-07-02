using NAudio.CoreAudioApi;
using NAudio.Wave.SampleProviders;
using NAudio.Wave;
using Reactive.Bindings;

namespace Spector.Model;

public class AudioInterface
{
    private readonly ReactiveCollection<IDevice> _devices = new();
    public ReadOnlyReactiveCollection<IDevice> Devices => _devices.ToReadOnlyReactiveCollection();

    public async Task ActivateAsync()
    {
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
        //// 新たに接続されたデバイスった場合
        //if (_settings.TryGetMicrophoneConfig(deviceId, out var deviceConfig) is false)
        //{
        //    deviceConfig = new DeviceConfig(deviceId, mmDevice.FriendlyName, true);
        //    List<DeviceConfig> deviceConfigs = _settings.DeviceConfigs.ToList();
        //    deviceConfigs.Add(deviceConfig);
        //    _settings = _settings with { DeviceConfigs = deviceConfigs };
        //    await _settingsRepository.SaveAsync(_settings);
        //}

        return new CaptureDevice(mmDevice);
    }

}
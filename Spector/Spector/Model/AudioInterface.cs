using NAudio.CoreAudioApi;
using Reactive.Bindings;

namespace Spector.Model;

public class AudioInterface
{
    private ReactiveCollection<IDevice> Devices { get; } = new();

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
            .EnumerateAudioEndPoints(DataFlow.All, DeviceState.Active)
            .ToList();

        // 新しく接続されたデバイスの確認
        var connectedDevices = mmDevices
            .Where(mmDevice => Devices.NotContains(device => device.Id.AsPrimitive() == mmDevice.ID));
        foreach (var mmDevice in connectedDevices)
        {
            var device = await ResolveDeviceAsync(mmDevice);
            Devices.Add(device);
        }

        // 切断されたデバイスの確認
        var disconnectedDevices = Devices
            .Where(device => mmDevices.NotContains(mmDevice => device.Id.AsPrimitive() == mmDevice.ID))
            .ToList(); // _devicesから作成しているので、いったん別のListにしないとRemove時にエラーとなるので詰め替えておく
        foreach (var device in disconnectedDevices)
        {
            Devices.Remove(device);
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

        IDevice device =
            mmDevice.DataFlow == DataFlow.Capture
                ? new CaptureDevice(
                    deviceId,
                    deviceConfig.Name,
                    mmDevice.FriendlyName,
                    deviceConfig.Measure,
                    mmDevice,
                    _fastFourierTransformSettings)
                : new RenderDevice(
                    deviceId,
                    deviceConfig.Name,
                    mmDevice.FriendlyName,
                    deviceConfig.Measure,
                    mmDevice,
                    _fastFourierTransformSettings);
        device.PropertyChanged += MicrophoneOnPropertyChanged;
        return device;
    }

}

public interface IDevice : IDisposable
{
}

public class LocalDevice : IDevice
{
    public void Dispose()
    {
        // TODO release managed resources here
    }
}
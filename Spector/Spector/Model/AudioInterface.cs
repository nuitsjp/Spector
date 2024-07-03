using System.ComponentModel;
using System.Management;
using System.Windows;
using NAudio.CoreAudioApi;
using NAudio.Wave.SampleProviders;
using NAudio.Wave;
using Reactive.Bindings;
using Microsoft.Extensions.FileSystemGlobbing;

namespace Spector.Model;

public class AudioInterface(ISettingsRepository settingsRepository)
{
    private Settings Settings { get; set; } = default!;
    private readonly ReactiveCollection<IDevice> _devices = new();

    public ReadOnlyReactiveCollection<IDevice> Devices => _devices.ToReadOnlyReactiveCollection();

    private ManagementEventWatcher Watcher { get; } = new(
        new WqlEventQuery("__InstanceOperationEvent")
        {
            WithinInterval = TimeSpan.FromSeconds(3),
            Condition = "TargetInstance ISA 'Win32_SoundDevice'"
        });

    public async Task ActivateAsync()
    {
        Settings = await settingsRepository.LoadAsync();
        Watcher.EventArrived += WatcherEventArrived;
        Watcher.Start();
        await LoadDevicesAsync();
    }

    private async void WatcherEventArrived(object sender, EventArrivedEventArgs e)
    {
        if (e.NewEvent["TargetInstance"] is not ManagementBaseObject) return;

        var eventType = e.NewEvent.ClassPath.ClassName;
        switch (eventType)
        {
            case "__InstanceCreationEvent":
            case "__InstanceDeletionEvent":
                await CurrentDispatcher.InvokeAsync(
                    async () =>
                    {
                        await LoadDevicesAsync();
                    });
                break;
        }
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
            .Where(mmDevice => _devices.NotContains(device => device.Id.AsPrimitive() == mmDevice.ID));
        foreach (var mmDevice in connectedDevices)
        {
            var device = await ResolveDeviceAsync(mmDevice);
            // プロパティの変更を監視する
            device.PropertyChanged += CaptureDeviceOnPropertyChanged;
            _devices.Add(device);
        }

        // 切断されたデバイスの確認
        var disconnectedDevices = _devices
            .Where(device => mmDevices.NotContains(mmDevice => device.Id.AsPrimitive() == mmDevice.ID))
            .ToList(); // _devicesから作成しているので、いったん別のListにしないとRemove時にエラーとなるので詰め替えておく
        foreach (var device in disconnectedDevices)
        {
            _devices.Remove(device);
            // プロパティの変更監視を解除する
            device.PropertyChanged -= CaptureDeviceOnPropertyChanged;
            device.Dispose();
        }
    }

    private async Task<IDevice> ResolveDeviceAsync(MMDevice mmDevice)
    {
        var deviceId = new DeviceId(mmDevice.ID);

        // 新たに接続されたデバイスった場合
        if (Settings.TryGetDeviceSettings(deviceId, out var deviceSettings) is false)
        {
            deviceSettings = new DeviceSettings(deviceId, mmDevice.FriendlyName, true);
            var deviceConfigs = Settings.DeviceSettings.ToList();
            deviceConfigs.Add(deviceSettings);
            Settings = Settings with { DeviceSettings = deviceConfigs };
            await settingsRepository.SaveAsync(Settings);
        }

        return new Device(
            mmDevice,
            deviceSettings.Name,
            deviceSettings.Measure,
            RecordingConfig.Default.WaveFormat);
    }

    private void CaptureDeviceOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        UpdateSettings();
    }

    private async void UpdateSettings()
    {
        Settings = Settings with { DeviceSettings = Devices.Select(x => new DeviceSettings(x.Id, x.Name, x.Measure)).ToArray() };
        await settingsRepository.SaveAsync(Settings);
    }

}
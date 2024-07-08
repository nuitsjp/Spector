using System.ComponentModel;
using System.IO;
using System.Management;
using System.Net;
using System.Net.Sockets;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings;

namespace Spector.Model;

public class AudioInterface(ISettingsRepository settingsRepository) : IDisposable
{
    public static readonly int RemotePort = 5432;
    private TcpListener Listener { get; } = new TcpListener(IPAddress.Any, RemotePort);
    private Task? ListenerTask { get; set; }
    private CancellationTokenSource CancellationTokenSource { get; } = new();
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
        Listener.Start();
        ListenerTask = Task.Run(async () => await ListenClientConnectAsync());
    }

    private void WatcherEventArrived(object sender, EventArrivedEventArgs e)
    {
        if (e.NewEvent["TargetInstance"] is not ManagementBaseObject) return;

        var eventType = e.NewEvent.ClassPath.ClassName;
        switch (eventType)
        {
            case "__InstanceCreationEvent":
            case "__InstanceDeletionEvent":
                CurrentDispatcher.InvokeAsync(async () => { await LoadDevicesAsync(); });
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

        return new LocalDevice(
            mmDevice,
            deviceSettings.Name,
            deviceSettings.Measure,
            RecordingConfig.Default.WaveFormat);
    }

    private async Task ListenClientConnectAsync()
    {
        try
        {
            while (CancellationTokenSource.IsCancellationRequested is false)
            {
                var client = await Listener.AcceptTcpClientAsync(CancellationTokenSource.Token);
                _ = Task.Run(() => HandleClientAsync(client));
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private void HandleClientAsync(TcpClient client)
    {
        IRemoteDevice device = new RemoteDevice(client, RecordingConfig.Default.WaveFormat);
        device.Disconnected += RemoteDeviceOnDisconnected;
        device.StartMeasure();
        _devices.Add(device);
    }

    private void RemoteDeviceOnDisconnected(object? sender, EventArgs e)
    {
        _devices.Remove((IDevice)sender!);
    }

    private void CaptureDeviceOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        UpdateSettings();
    }

    private async void UpdateSettings()
    {
        Settings = Settings with
        {
            DeviceSettings = Settings.DeviceSettings
                .Select(x =>
                {
                    var device = Devices.SingleOrDefault(d => d.Id == x.Id);
                    return device is null 
                        ? x 
                        : new DeviceSettings(device.Id, device.Name, device.Measure);
                })
                .ToArray()
        };
        await settingsRepository.SaveAsync(Settings);
    }

    public void Dispose()
    {
        // ToArray()しておかないと同時に他から操作されていると例外が発生する
        foreach (var device in _devices.ToArray()) 
        {
            device.Dispose();
        }
        _devices.Dispose();
        Watcher.Dispose();
    }
}
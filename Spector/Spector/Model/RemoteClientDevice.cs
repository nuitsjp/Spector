using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.Net;
using System.Net.Sockets;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using System.IO;

namespace Spector.Model;

public partial class RemoteClientDevice : ObservableObject, IRemoteDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;

    public RemoteClientDevice(
        IDevice device,
        string address)
    {
        Device = device;
        Address = address;
        Name = $"{device.Name}(Server:{Dns.GetHostName()})";
        _measure = device.Measure;
        VolumeLevel = device.VolumeLevel;

        Device.ObserveProperty(x => x.Measure).Subscribe(x => Measure = x).AddTo(CompositeDisposable);
        Device.ObserveProperty(x => x.Level).Subscribe(x => Level = x).AddTo(CompositeDisposable);
    }

    private CompositeDisposable CompositeDisposable { get; } = new();
    private IDevice Device { get; }
    private string Address { get; }
    public DeviceId Id => (DeviceId)@$"{Device.Id}(Server:{Dns.GetHostName()})";
    public DataFlow DataFlow => Device.DataFlow;
    public WaveFormat WaveFormat => Device.WaveFormat;
    public string Name { get; set; }
    public string SystemName => @$"{Device.Name}(Server:{Dns.GetHostName()})";
    [ObservableProperty] private bool _measure;
    public bool Connect { get; set; } = true;
    public bool Connectable => false;
    public VolumeLevel VolumeLevel { get; set; }
    [ObservableProperty] private Decibel _level = Decibel.Minimum;
    private TcpClient? TcpClient { get; set; }
    private NetworkStream? NetworkStream { get; set; }
    public bool Connected { get; private set; }
    private bool Measuring { get; set; }
    public Task ConnectAsync()
    {
        return Task.Run(() =>
        {
            TcpClient = new TcpClient().AddTo(CompositeDisposable);
            TcpClient.Connect(Address, AudioInterface.RemotePort);

            NetworkStream = TcpClient.GetStream().AddTo(CompositeDisposable);
            var writer = new BinaryWriter(NetworkStream).AddTo(CompositeDisposable);

            // デバイス情報を送信
            writer.Write(nameof(DataFlow.Capture));
            writer.Write(@$"{Device.Name}(Client:{Dns.GetHostName()})");
            writer.Flush();

            Device.DataAvailable += DeviceOnDataAvailable;
            Connected = true;
            Measuring = true;
        });
    }

    public Task DisconnectAsync()
    {
        Device.DataAvailable -= DeviceOnDataAvailable;
        Dispose();
        Connect = false;
        Measuring = false;
        return Task.CompletedTask;
    }

    private void DeviceOnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (!Measuring || NetworkStream is null) return;

        NetworkStream.Write(e.Buffer, 0, e.BytesRecorded);
        NetworkStream.Flush();
    }

    public void StartMeasure()
    {
        Measuring = true;
    }

    public void StopMeasure()
    {
        Measuring = false;
    }

    public void PlayLooping(CancellationToken token)
    {
        throw new NotImplementedException();
    }

    public void Dispose()
    {
        CompositeDisposable.Dispose();
    }
}
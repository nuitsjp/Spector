using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.Net;
using System.Net.Sockets;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using System.IO;

namespace Spector.Model;

public partial class RemoteClientDevice(
    IDevice device,
    string address) : ObservableObject, IDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;

    private CompositeDisposable CompositeDisposable { get; } = new();

    public DeviceId Id => (DeviceId)@$"{device.Id}(Server:{Dns.GetHostName()})";
    public DataFlow DataFlow { get; } = device.DataFlow;
    public WaveFormat WaveFormat => device.WaveFormat;
    public string Name { get; set; } = @$"{device.Name}(Server:{Dns.GetHostName()})";
    public string SystemName { get; } = @$"{device.Name}(Server:{Dns.GetHostName()})";
    [ObservableProperty] private bool _measure = device.Measure;
    public bool Connect { get; set; } = device.Connect;
    public bool Connectable => false;
    public VolumeLevel VolumeLevel { get; set; } = device.VolumeLevel;
    [ObservableProperty] private Decibel _level = Decibel.Minimum;
    private TcpClient? TcpClient { get; set; }
    private NetworkStream? NetworkStream { get; set; }

    public void StartMeasure()
    {
        device.ObserveProperty(x => x.Measure).Subscribe(x => Measure = x).AddTo(CompositeDisposable);
        device.ObserveProperty(x => x.Level).Subscribe(x => Level = x).AddTo(CompositeDisposable);

        TcpClient = new TcpClient().AddTo(CompositeDisposable);
        TcpClient.Connect(address, AudioInterface.RemotePort);

        NetworkStream = TcpClient.GetStream().AddTo(CompositeDisposable);
        var writer = new BinaryWriter(NetworkStream);

        // デバイス情報を送信
        writer.Write(nameof(DataFlow.Capture));
        writer.Write(@$"{device.Name}(Client:{Dns.GetHostName()})");
        writer.Flush();

        device.DataAvailable += (s, e) =>
        {
            NetworkStream.Write(e.Buffer, 0, e.BytesRecorded);
            NetworkStream.Flush();
        };
    }

    public void StopMeasure()
    {
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
using System.IO;
using System.Net.Sockets;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.VisualBasic;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public partial class RemoteDevice : ObservableObject, IRemoteDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;
    public event EventHandler? Disconnected;
    public RemoteDevice(TcpClient tcpClient)
    {
        TcpClient = tcpClient.AddTo(CompositeDisposable);
        NetworkStream = TcpClient.GetStream().AddTo(CompositeDisposable);
        BinaryReader = new BinaryReader(NetworkStream).AddTo(CompositeDisposable);
        BinaryWriter = new BinaryWriter(NetworkStream).AddTo(CompositeDisposable);

        // デバイス情報の受信
        var dataFlow = BinaryReader.ReadInt32();
        var rate = BinaryReader.ReadInt32();
        var encoding = (WaveFormatEncoding)BinaryReader.ReadUInt16();
        var bits = BinaryReader.ReadInt32();
        var channels = BinaryReader.ReadInt32();
        var deviceName = BinaryReader.ReadString();

        Id = (DeviceId)deviceName;
        DataFlow = (DataFlow)dataFlow;
        WaveFormat = 
            encoding == WaveFormatEncoding.IeeeFloat
                ? WaveFormat.CreateIeeeFloatWaveFormat(rate, channels)
                : new WaveFormat(rate, bits, channels);
        Name = deviceName;
        SystemName = deviceName;

        LevelMeter = new AudioLevelMeter(WaveFormat);
    }

    private CompositeDisposable CompositeDisposable { get; } = [];
    public DeviceId Id { get; }
    public DataFlow DataFlow { get; }
    public WaveFormat WaveFormat { get; }
    public string Name { get; set; }
    public string SystemName { get; }
    public bool Measure { get; private set; }
    public bool Connect { get; set; } = true;
    public bool Connectable => false;
    public VolumeLevel VolumeLevel { get; set; }
    public Decibel Level { get; private set; } = Decibel.Minimum;

    private readonly List<Decibel> _levels = [];
    public IReadOnlyList<Decibel> Levels => _levels;
    private TcpClient TcpClient { get; }
    private BinaryReader BinaryReader { get; }
    private BinaryWriter BinaryWriter { get; }
    private NetworkStream NetworkStream { get; }
    private AudioLevelMeter LevelMeter { get; }
    private CancellationTokenSource CancellationTokenSource { get; } = new();


    public Task DisconnectAsync()
    {
        CancellationTokenSource.Cancel();
        Dispose();
        return Task.CompletedTask;
    }

    public void StartMeasure()
    {
        _levels.Clear();
        Task.Run(() =>
        {
            Measure = true;
            int bytesPerSecond = WaveFormat.SampleRate * WaveFormat.Channels * (WaveFormat.BitsPerSample / 8);
            int bufferSize = bytesPerSecond / 20; // 1秒の1/20 = 50ms
            byte[] buffer = new byte[bufferSize];
            while (CancellationTokenSource.IsCancellationRequested is false)
            {
                // ここにCaptureデバイスのデータを処理するコードを追加
                var length = BinaryReader.Read(buffer, 0, buffer.Length);
                if (length == 0)
                {
                    // 接続が切れた場合、読み込みが0になる
                    DisconnectAsync();
                }
                OnDataAvailable(buffer, length);
            }
        });
    }

    public void StopMeasure()
    {
        Measure = false;
        Level = Decibel.Minimum;
    }

    private void OnDataAvailable(byte[] bytes, int length)
    {
        if (Measure is false) return;

        Level = LevelMeter.CalculateLevel(bytes, length);
        _levels.Add(Level);
    }

    public void PlayLooping(CancellationToken token)
    {
        BinaryWriter.Write((int)RemoteCommand.StartPlayLooping);
        token.Register(() =>
        {
            BinaryWriter.Write((int)RemoteCommand.StopPlayLooping);
        });
    }

    public void Dispose()
    {
        CompositeDisposable.Dispose();
        Disconnected?.Invoke(this, EventArgs.Empty);
        GC.SuppressFinalize(this);
    }
}
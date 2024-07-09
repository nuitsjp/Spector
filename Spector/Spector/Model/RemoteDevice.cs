using System.Data;
using System.IO;
using System.Net.Sockets;
using System.Xml.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public partial class RemoteDevice : ObservableObject, IRemoteDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;
    public event EventHandler? Disconnected;
    public RemoteDevice(
        TcpClient tcpClient,
        WaveFormat waveFormat)
    {
        TcpClient = tcpClient.AddTo(CompositeDisposable);
        NetworkStream = TcpClient.GetStream().AddTo(CompositeDisposable);
        BinaryReader = new BinaryReader(NetworkStream).AddTo(CompositeDisposable);
        BinaryWriter = new BinaryWriter(NetworkStream).AddTo(CompositeDisposable);

        // デバイス情報の受信
        var dataFlow = BinaryReader.ReadInt32();
        var deviceName = BinaryReader.ReadString();

        Id = (DeviceId)deviceName;
        DataFlow = (DataFlow)dataFlow;
        WaveFormat = waveFormat;
        Name = deviceName;
        SystemName = deviceName;

        BufferedWaveProvider = new BufferedWaveProvider(waveFormat);
        AWeightingFilter = new AWeightingFilter(BufferedWaveProvider.ToSampleProvider());
    }

    private CompositeDisposable CompositeDisposable { get; } = new();
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
    private TcpClient TcpClient { get; }
    private BinaryReader BinaryReader { get; }
    private BinaryWriter BinaryWriter { get; }
    private NetworkStream NetworkStream { get; }
    private BufferedWaveProvider BufferedWaveProvider { get; }

    private AWeightingFilter AWeightingFilter { get; set; }

    private Task MeasureTask { get; set; } = Task.CompletedTask;
    private CancellationTokenSource CancellationTokenSource { get; } = new();


    public Task DisconnectAsync()
    {
        CancellationTokenSource.Cancel();
        Dispose();
        return Task.CompletedTask;
    }

    public void StartMeasure()
    {
        MeasureTask = Task.Run(() =>
        {
            Measure = true;
            while (CancellationTokenSource.IsCancellationRequested is false)
            {
                // ここにCaptureデバイスのデータを処理するコードを追加
                var buffer = new byte[9600];
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

        BufferedWaveProvider.AddSamples(bytes, 0, length);
        DataAvailable?.Invoke(this, new WaveInEventArgs(bytes, length));

        var buffer = new float[length / 2];
        var samplesRead = AWeightingFilter!.Read(buffer, 0, buffer.Length);

        // 音量計算（RMS値）
        double sum = 0;
        for (var i = 0; i < samplesRead; i++)
        {
            sum += buffer[i] * buffer[i];
        }
        var rms = Math.Sqrt(sum / samplesRead);
        var db = 20 * Math.Log10(rms);

        var level = (Decibel)db;
        Level = Decibel.Minimum <= level
            ? level
            : Decibel.Minimum;
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
    }
}
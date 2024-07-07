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

public partial class RemoteServerDevice : ObservableObject, IRemoteDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;
    public RemoteServerDevice(
        TcpClient tcpClient,
        WaveFormat waveFormat)
    {

        TcpClient = tcpClient.AddTo(CompositeDisposable);
        NetworkStream = TcpClient.GetStream().AddTo(CompositeDisposable);
        BinaryReader = new BinaryReader(NetworkStream).AddTo(CompositeDisposable);

        // デバイス情報の受信
        var dataFlow = BinaryReader.ReadString();
        var deviceName = BinaryReader.ReadString();

        Id = (DeviceId)deviceName;
        DataFlow = dataFlow == "Capture" 
            ? DataFlow.Capture 
            : DataFlow.Render;
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
    public bool Measure { get; } = true;
    public bool Connect { get; set; } = true;
    public bool Connectable => true;
    public VolumeLevel VolumeLevel { get; set; }
    public Decibel Level { get; private set; }
    private TcpClient TcpClient { get; }
    private BinaryReader BinaryReader { get; }
    private NetworkStream NetworkStream { get; }
    private BufferedWaveProvider BufferedWaveProvider { get; }

    private AWeightingFilter AWeightingFilter { get; set; }

    public bool Connected { get; private set; }
    private Task MeasureTask { get; set; } = Task.CompletedTask;
    private CancellationTokenSource CancellationTokenSource { get; } = new();


    public Task ConnectAsync()
    {
        Connected = true;
        return Task.Run(() =>
        {

            while (CancellationTokenSource.IsCancellationRequested is false)
            {
                // ここにCaptureデバイスのデータを処理するコードを追加
                byte[] buffer = new byte[9600];
                var length = BinaryReader.Read(buffer, 0, buffer.Length);
                OnDataAvailable(buffer, length);
            }
        });
    }

    public Task DisconnectAsync()
    {
        throw new NotImplementedException();
    }

    public void StartMeasure()
    {
    }

    public void StopMeasure()
    {
    }

    private void OnDataAvailable(byte[] bytes, int length)
    {
        BufferedWaveProvider.AddSamples(bytes, 0, length);

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
    }

    public void Dispose()
    {
    }
}
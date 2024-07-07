using System.IO;
using System.Net.Sockets;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Spector.Model;

public partial class RemoteServerDevice(
    DataFlow dataFlow,
    string name,
    WaveFormat waveFormat,
    TcpClient tcpClient,
    BinaryReader reader,
    NetworkStream stream) : ObservableObject, IDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;
    public DeviceId Id { get; } = (DeviceId)name;
    public DataFlow DataFlow { get; } = dataFlow;
    public WaveFormat WaveFormat { get; } = waveFormat;
    public string Name { get; set; } = name;
    public string SystemName { get; } = name;
    public bool Measure { get; } = true;
    public bool Connect { get; set; } = true;
    public bool Connectable => true;
    public VolumeLevel VolumeLevel { get; set; }
    public Decibel Level { get; private set; }
    private BufferedWaveProvider BufferedWaveProvider { get; } = new(waveFormat);

    private AWeightingFilter? AWeightingFilter { get; set; }

    private Task MeasureTask { get; set; } = Task.CompletedTask;
    private CancellationTokenSource CancellationTokenSource { get; } = new();

    public void StartMeasure()
    {
        MeasureTask = Task.Run(() =>
        {
            AWeightingFilter = new AWeightingFilter(BufferedWaveProvider.ToSampleProvider());

            while (CancellationTokenSource.IsCancellationRequested is false)
            {
                // ここにCaptureデバイスのデータを処理するコードを追加
                byte[] buffer = new byte[9600];
                var length = reader.Read(buffer, 0, buffer.Length);
                OnDataAvailable(buffer, length);
            }
        });
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
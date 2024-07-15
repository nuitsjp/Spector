using System.IO;
using System.Net.Http;
using System.Net.Sockets;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.VisualBasic;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public partial class RemoteDevice : DeviceBase, IRemoteDevice
{
    public event EventHandler? Disconnected;

    public static RemoteDevice Create(TcpClient tcpClient)
    {
        var networkStream = tcpClient.GetStream();
        var reader = new BinaryReader(networkStream);
        var writer = new BinaryWriter(networkStream);

        // デバイス情報の受信
        var dataFlow = reader.ReadInt32();
        var rate = reader.ReadInt32();
        var encoding = (WaveFormatEncoding)reader.ReadUInt16();
        var bits = reader.ReadInt32();
        var channels = reader.ReadInt32();
        var deviceName = reader.ReadString();
        var waveFormat =
            encoding == WaveFormatEncoding.IeeeFloat
                ? WaveFormat.CreateIeeeFloatWaveFormat(rate, channels)
                : new WaveFormat(rate, bits, channels);
        return new RemoteDevice(
            tcpClient,
            networkStream,
            reader,
            writer,
            waveFormat,
            (DeviceId)deviceName,
            (DataFlow)dataFlow,
            deviceName);
    }

    public RemoteDevice(
        TcpClient tcpClient,
        NetworkStream networkStream,
        BinaryReader reader,
        BinaryWriter writer,
        WaveFormat waveFormat,
        DeviceId id,
        DataFlow dataFlow,
        string name)
        : base(id, dataFlow, name, name)
    {
        TcpClient = tcpClient;
        NetworkStream = networkStream;
        BinaryReader = reader;
        BinaryWriter = writer;
        WaveFormat = waveFormat;
        AvailableWaveFormats = [WaveFormat];

        //LevelMeter = new AudioLevelMeter(WaveFormat);
    }

    private TcpClient TcpClient { get; }
    private BinaryReader BinaryReader { get; }
    private BinaryWriter BinaryWriter { get; }
    private NetworkStream NetworkStream { get; }

    private CompositeDisposable CompositeDisposable { get; } = [];

    public override IReadOnlyList<WaveFormat> AvailableWaveFormats { get; }
    public override bool Connectable => false;
    public override VolumeLevel VolumeLevel { get; set; }
    public bool Connect { get; set; } = true;


    public override Task DisconnectAsync()
    {
        StopMeasure();
        Dispose();
        return Task.CompletedTask;
    }


    public override void StartMeasure()
    {
        base.StartMeasure(new TcpWaveIn(WaveFormat, BinaryReader));
    }

    public override void StopMeasure()
    {
        base.StopMeasure();
        Disconnected?.Invoke(this, EventArgs.Empty);
    }

    public override void PlayLooping(CancellationToken token)
    {
        BinaryWriter.Write((int)RemoteCommand.StartPlayLooping);
        token.Register(() =>
        {
            BinaryWriter.Write((int)RemoteCommand.StopPlayLooping);
        });
    }

    public override void Dispose()
    {
        CompositeDisposable.Dispose();
        Disconnected?.Invoke(this, EventArgs.Empty);
        GC.SuppressFinalize(this);
    }

    private class TcpWaveIn(WaveFormat waveFormat, BinaryReader binaryReader) : IWaveIn
    {
        public event EventHandler<WaveInEventArgs>? DataAvailable;
        public event EventHandler<StoppedEventArgs>? RecordingStopped;

        public WaveFormat WaveFormat { get; set; } = waveFormat;
        private BinaryReader BinaryReader { get; } = binaryReader;

        private bool IsRecording { get; set; }

        public void StartRecording()
        {
            IsRecording = true;
            Task.Run(() =>
            {
                var bytesPerSecond = WaveFormat.SampleRate * WaveFormat.Channels * (WaveFormat.BitsPerSample / 8);
                var bufferSize = bytesPerSecond / 20; // 1秒の1/20 = 50ms
                var buffer = new byte[bufferSize];
                while (IsRecording)
                {
                    // ここにCaptureデバイスのデータを処理するコードを追加
                    var length = BinaryReader.Read(buffer, 0, buffer.Length);
                    if (length == 0)
                    {
                        // 接続が切れた場合、読み込みが0になる
                        RecordingStopped?.Invoke(this, new StoppedEventArgs());
                    }
                    DataAvailable?.Invoke(this, new WaveInEventArgs(buffer, length));
                }
            });
        }

        public void StopRecording()
        {
            if(IsRecording is false) return;

            IsRecording = false;
        }

        public void Dispose()
        {
        }
    }


}
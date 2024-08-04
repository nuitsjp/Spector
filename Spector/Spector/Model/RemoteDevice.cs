using System.IO;
using System.Net.Sockets;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public partial class RemoteDevice : DeviceBase, IRemoteDevice
{
    public override event EventHandler<EventArgs>? Disconnected;

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
        var waveFormat = encoding switch
        {
            WaveFormatEncoding.Pcm => new WaveFormat(rate, bits, channels),
            WaveFormatEncoding.IeeeFloat => WaveFormat.CreateIeeeFloatWaveFormat(rate, channels),
            WaveFormatEncoding.Extensible => new WaveFormatExtensible(rate, bits, channels),
            WaveFormatEncoding.ALaw => WaveFormat.CreateALawFormat(rate, channels),
            WaveFormatEncoding.MuLaw => WaveFormat.CreateMuLawFormat(rate, channels),
            _ => throw new ArgumentOutOfRangeException(nameof(encoding))
        };
        return new RemoteDevice(
            new TcpWaveIn(waveFormat, tcpClient, networkStream, reader, writer),
            waveFormat,
            (DeviceId)deviceName,
            (DataFlow)dataFlow,
            deviceName);
    }

    private RemoteDevice(
        TcpWaveIn writer,
        WaveFormat waveFormat,
        DeviceId id,
        DataFlow dataFlow,
        string name)
        : base(id, dataFlow, name, name)
    {
        WaveFormat = waveFormat;
        WaveIn = writer.AddTo(CompositeDisposable);
    }

    private TcpWaveIn WaveIn { get; }

    private CompositeDisposable CompositeDisposable { get; } = [];

    public override bool Connectable => false;
    public override VolumeLevel VolumeLevel { get; set; }
    public bool Connect { get; set; } = true;


    public override void Disconnect()
    {
        StopMeasure();
        Dispose();
    }


    public override void StartMeasure()
    {
        base.StartMeasure(WaveIn);
    }

    public override void StopMeasure()
    {
        Dispose();
    }

    public override void StartPlayback()
    {
        WaveIn.SendRemoteCommand(RemoteCommand.StartPlayLooping);
    }

    public override void StopPlayback()
    {
        WaveIn.SendRemoteCommand(RemoteCommand.StopPlayLooping);
    }

    public override void Dispose()
    {
        base.StopMeasure();
        Disconnected?.Invoke(this, EventArgs.Empty);
        CompositeDisposable.Dispose();

        GC.SuppressFinalize(this);
    }

    private class TcpWaveIn(
        WaveFormat waveFormat,
        TcpClient tcpClient,
        NetworkStream networkStream, 
        BinaryReader binaryReader, 
        BinaryWriter binaryWriter) : IWaveIn
    {
        public event EventHandler<WaveInEventArgs>? DataAvailable;
        public event EventHandler<StoppedEventArgs>? RecordingStopped;

        public WaveFormat WaveFormat { get; set; } = waveFormat;

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
                    try
                    {
                        var length = binaryReader.Read(buffer, 0, buffer.Length);
                        if (length == 0)
                        {
                            // 接続が切れた場合、読み込みが0になる
                            StopRecording();
                        }
                        DataAvailable?.Invoke(this, new WaveInEventArgs(buffer, length));
                    }
                    catch (IOException)
                    {
                        StopRecording();
                    }
                }
            });
        }

        public void SendRemoteCommand(RemoteCommand command)
        {
            binaryWriter.Write((int)command);
        }

        public void StopRecording()
        {
            Dispose();
        }

        public void Dispose()
        {
            if (IsRecording is false) return;

            IsRecording = false;

            binaryReader.Dispose();
            binaryWriter.Dispose();
            networkStream.Dispose();
            tcpClient.Dispose();
            CurrentDispatcher.Invoke(() =>
            {
                RecordingStopped?.Invoke(this, new StoppedEventArgs());
            });
        }
    }


}
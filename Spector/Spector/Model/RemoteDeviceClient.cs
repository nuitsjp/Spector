using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reactive.Linq;
using System.Reactive.Subjects;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public class RemoteDeviceClient : IDisposable
{
    public RemoteDeviceClient(IDevice device)
    {
        Device = device;
        TcpClient = new TcpClient().AddTo(CompositeDisposable);
        RemoteCommandSubject = new Subject<RemoteCommand>().AddTo(CompositeDisposable);
    }
    private CompositeDisposable CompositeDisposable { get; } = new();
    private IDevice Device { get; }
    private TcpClient TcpClient { get; }
    private NetworkStream? NetworkStream { get; set; }

    private Subject<RemoteCommand> RemoteCommandSubject { get; }
    public IObservable<RemoteCommand> RemoteCommandObservable => RemoteCommandSubject.AsObservable();

    public Task ConnectAsync(string address, int port)
    {
        return Task.Run(() =>
        {
            TcpClient.Connect(address, port);
            NetworkStream = TcpClient.GetStream().AddTo(CompositeDisposable);
            // デバイス情報の送信
            var writer = new BinaryWriter(NetworkStream);
            writer.Write((int)Device.DataFlow);
            writer.Write(Device.WaveFormat.SampleRate);
            writer.Write((ushort)Device.WaveFormat.Encoding);
            writer.Write(Device.WaveFormat.BitsPerSample);
            writer.Write(Device.WaveFormat.Channels);
            writer.Write(@$"{Device.Name} - {Dns.GetHostName()}");
            writer.Flush();

            var reader = new BinaryReader(NetworkStream).AddTo(CompositeDisposable);
            try
            {
                while (TcpClient.Connected)
                {
                    var command = (RemoteCommand)reader.ReadInt32();
                    RemoteCommandSubject.OnNext(command);
                }
            }
            catch (IOException)
            {
                // TcpClientが切断された場合
            }
        });
    }

    public void Write(byte[] buffer, int offset, int length)
    {
        NetworkStream?.Write(buffer, offset, length);
    }

    public void Disconnect()
    {
        Dispose();
    }

    public void Dispose()
    {
        TcpClient.Close();
        NetworkStream?.Close();
        CompositeDisposable.Dispose();
    }
}
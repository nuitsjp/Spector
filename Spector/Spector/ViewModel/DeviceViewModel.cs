using System.Reactive.Disposables;
using System.Reactive.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using Reactive.Bindings.Extensions;
using Spector.Model;

namespace Spector.ViewModel;

public partial class DeviceViewModel : ObservableObject, IDisposable
{
    public DeviceViewModel(IDevice device)
    {
        Device = device;
        CompositeDisposable.Add(Device);

        // デバイス名を同期する
        Name = Device.Name;
        this.ObserveProperty(x => x.Name)
            .Skip(1) // 上記の「Name = Device.Name;」の変更をスキップする。
            .Subscribe(name => Device.Name = name)
            .AddTo(CompositeDisposable);
        // 計測状態を同期する
        Measure = Device.Measure;
        this.ObserveProperty(x => x.Measure)
            .Skip(1) // 上記の「Measure = Device.Measure;」の変更をスキップする。
            .Subscribe(measure =>
            {
                if (measure)
                {
                    Device.StartMeasure();
                }
                else
                {
                    Device.StopMeasure();
                }
            })
            .AddTo(CompositeDisposable);
    }

    private IDevice Device { get; }

    public DataFlow DataFlow => Device.DataFlow;

    [ObservableProperty] private string _name;
    public string SystemName => Device.SystemName;

    [ObservableProperty] private bool _measure;

    public double[] LiveData { get; } = CreateEmptyData();

    private CompositeDisposable CompositeDisposable { get; } = new();

    private static double[] CreateEmptyData()
    {
        var liveData = new double[4800];
        Array.Fill(liveData, Decibel.Minimum.AsPrimitive());
        return liveData;
    }

    public void UpdateLiveData()
    {
        // "scroll" the whole chart to the left
        Array.Copy(LiveData, 1, LiveData, 0, LiveData.Length - 1);

        // place the newest data point at the end
        LiveData[^1] = Device.Level.AsPrimitive();
    }

    public void Dispose()
    {
        CompositeDisposable.Dispose();
    }
}
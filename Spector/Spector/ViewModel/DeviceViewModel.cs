using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using Spector.Model;

namespace Spector.ViewModel;

public class DeviceViewModel(IDevice device) : ObservableObject
{
    private IDevice Device { get; } = device;

    public DataFlow DataFlow => Device.DataFlow;

    public string Name => Device.Name;

    public double[] LiveData { get; } = CreateEmptyData();

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

}
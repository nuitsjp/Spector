using System.Windows;
using Spector.Model;
using Windows.Devices.Sensors;
using Windows.Foundation;

namespace Spector.View
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow
    {
        private CompassWrapper _compassWrapper;

        public MainWindow()
        {
            InitializeComponent();
            InitializeCompass();
        }

        private void MainWindow_OnLoaded(object sender, RoutedEventArgs e)
        {
            CurrentDispatcher.Dispatcher = Application.Current.Dispatcher;
        }

        private async void InitializeCompass()
        {
            _compassWrapper = new CompassWrapper();
            bool initialized = await _compassWrapper.InitializeAsync();
            if (initialized)
            {
                _compassWrapper.StartReading(OnCompassReadingChanged);
            }
            else
            {
                MessageBox.Show("Compass initialization failed");
            }
        }

        private void OnCompassReadingChanged(Compass sender, CompassReadingChangedEventArgs args)
        {
            Dispatcher.Invoke(() =>
            {
                double heading = args.Reading.HeadingMagneticNorth;
            });
        }

        protected override void OnClosed(EventArgs e)
        {
            _compassWrapper?.StopReading(OnCompassReadingChanged);
            base.OnClosed(e);
        }
    }
}

public class CompassWrapper
{
    private Compass _compass;

    public async Task<bool> InitializeAsync()
    {
        _compass = Compass.GetDefault();
        return _compass != null;
    }

    public double GetHeading()
    {
        if (_compass == null)
            throw new InvalidOperationException("Compass is not initialized");

        var reading = _compass.GetCurrentReading();
        return reading.HeadingMagneticNorth;
    }

    public void StartReading(TypedEventHandler<Compass, CompassReadingChangedEventArgs> handler)
    {
        if (_compass == null)
            throw new InvalidOperationException("Compass is not initialized");

        _compass.ReadingChanged += handler;
    }

    public void StopReading(TypedEventHandler<Compass, CompassReadingChangedEventArgs> handler)
    {
        if (_compass == null)
            throw new InvalidOperationException("Compass is not initialized");

        _compass.ReadingChanged -= handler;
    }
}
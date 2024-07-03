using NAudio.Dsp;
using NAudio.Wave;

namespace Spector.Model;

public class AWeightingFilter(ISampleProvider source) : ISampleProvider
{
    private readonly BiQuadFilter[] _filters =
    [
        // A-weighting filter coefficients based on ITU-R 468-4 standard
        BiQuadFilter.PeakingEQ(44100, 20.6f, 0.5f, -20.0f),
        BiQuadFilter.PeakingEQ(44100, 107.7f, 0.5f, 2.0f),
        BiQuadFilter.PeakingEQ(44100, 737.9f, 0.5f, 0.0f),
        BiQuadFilter.PeakingEQ(44100, 12200.0f, 0.5f, -12.0f)
    ];

    // A-weighting filter coefficients based on ITU-R 468-4 standard

    public int Read(float[] buffer, int offset, int count)
    {
        var samplesRead = source.Read(buffer, offset, count);
        for (var i = 0; i < samplesRead; i++)
        {
            var sample = buffer[offset + i];
            foreach (var filter in _filters)
            {
                sample = filter.Transform(sample);
            }
            buffer[offset + i] = sample;
        }
        return samplesRead;
    }

    public WaveFormat WaveFormat => source.WaveFormat;
}

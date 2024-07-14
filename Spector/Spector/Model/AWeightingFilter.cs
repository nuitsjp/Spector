using NAudio.Dsp;
using NAudio.Wave;

namespace Spector.Model;

public class AWeightingFilter : ISampleProvider
{
    private readonly ISampleProvider _source;
    private readonly BiQuadFilter[] _filtersLeft;
    private readonly BiQuadFilter[]? _filtersRight;

    public AWeightingFilter(ISampleProvider source)
    {
        _source = source;
        _filtersLeft = CreateFilters(source.WaveFormat.SampleRate);
        if (source.WaveFormat.Channels == 2)
        {
            _filtersRight = CreateFilters(source.WaveFormat.SampleRate);
        }
    }

    private static BiQuadFilter[] CreateFilters(int sampleRate)
    {
        return
        [
            BiQuadFilter.PeakingEQ(sampleRate, 20.6f, 0.5f, -20.0f),
            BiQuadFilter.PeakingEQ(sampleRate, 107.7f, 0.5f, 2.0f),
            BiQuadFilter.PeakingEQ(sampleRate, 737.9f, 0.5f, 0.0f),
            BiQuadFilter.PeakingEQ(sampleRate, 12200.0f, 0.5f, -12.0f)
        ];
    }

    public int Read(float[] buffer, int offset, int count)
    {
        var samplesRead = _source.Read(buffer, offset, count);
        for (var i = 0; i < samplesRead; i += _source.WaveFormat.Channels)
        {
            var sampleLeft = buffer[offset + i];
            foreach (var filter in _filtersLeft)
            {
                sampleLeft = filter.Transform(sampleLeft);
            }
            buffer[offset + i] = sampleLeft;

            if (_source.WaveFormat.Channels == 2)
            {
                var sampleRight = buffer[offset + i + 1];
                foreach (var filter in _filtersRight!)
                {
                    sampleRight = filter.Transform(sampleRight);
                }
                buffer[offset + i + 1] = sampleRight;
            }
        }
        return samplesRead;
    }

    public WaveFormat WaveFormat => _source.WaveFormat;
}
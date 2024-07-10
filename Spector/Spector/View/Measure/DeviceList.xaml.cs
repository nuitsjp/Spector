using System.ComponentModel;
using System.Windows;

namespace Spector.View
{
    /// <summary>
    /// DeviceList.xaml の相互作用ロジック
    /// </summary>
    public partial class DeviceList
    {
        public DeviceList()
        {
            InitializeComponent();
            AudioDataGrid.Loaded += AudioDataGrid_Loaded;
        }

        private void AudioDataGrid_Loaded(object sender, RoutedEventArgs e)
        {
            var dataFlow = AudioDataGrid.Columns[0]; // 0番目の列（DataFlow列）を指定
            var name = AudioDataGrid.Columns[1]; // 1番目の列（Name列）を指定
            AudioDataGrid.Items.SortDescriptions.Clear();
            AudioDataGrid.Items.SortDescriptions.Add(new SortDescription(dataFlow.SortMemberPath, ListSortDirection.Descending));
            AudioDataGrid.Items.SortDescriptions.Add(new SortDescription(name.SortMemberPath, ListSortDirection.Ascending));

            foreach (var col in AudioDataGrid.Columns)
            {
                col.SortDirection = null;
            }
            dataFlow.SortDirection = ListSortDirection.Descending;
            name.SortDirection = ListSortDirection.Ascending;
            AudioDataGrid.Items.Refresh();
        }
    }
}

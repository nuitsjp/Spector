using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;

namespace Spector.View
{
    /// <summary>
    /// DeviceList.xaml の相互作用ロジック
    /// </summary>
    public partial class DeviceList : UserControl
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

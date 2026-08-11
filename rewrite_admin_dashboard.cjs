const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'AdminDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace 3: The huge UI block for Results
const oldUIBlockStart = `{activeTab === 'results' && (`;
const oldUIBlockEnd = `{/* Placeholder for other tabs */}`;
const oldUIRegex = new RegExp(oldUIBlockStart.replace(/[.*+?^$\{}[\]\(\)]/g, '\\$&') + '[\\s\\S]*?' + oldUIBlockEnd.replace(/[.*+?^$\{}[\]\(\)]/g, '\\$&'));

const newUIBlock = `{activeTab === 'results' && (
          <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Analitik Hasil Try Out</h2>
                <p className="text-slate-500 mt-1">Telusuri performa siswa berdasarkan hirarki Paket &rarr; Sekolah &rarr; Siswa.</p>
              </div>
            </div>
            
            {!selectedAnalyticsPackage ? (
              // Step 1: List Packages
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                  <FileText className="text-blue-500" size={20} />
                  <h3 className="text-lg font-semibold text-slate-800 m-0">Pilih Paket Ujian</h3>
                </div>
                
                {analyticsPackages.length === 0 ? (
                  <div className="p-12 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <BarChart2 size={48} className="mb-4 opacity-50" />
                    <p className="text-lg">Belum ada data analitik.</p>
                    <p className="text-sm">Siswa harus menyelesaikan ujian terlebih dahulu.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {analyticsPackages.map(pkg => (
                      <div 
                        key={pkg.id} 
                        className="group bg-white p-6 border border-slate-200 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 relative overflow-hidden" 
                        onClick={() => handleSelectAnalyticsPackage(pkg)}
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 transform origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300"></div>
                        <div className="flex items-start justify-between mb-4">
                          <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
                            <BookOpen size={24} />
                          </div>
                          <span className="bg-slate-100 text-slate-500 text-xs px-3 py-1 rounded-full font-medium">Paket Aktif</span>
                        </div>
                        <h4 className="font-bold text-lg text-slate-800 mb-1 line-clamp-2">{pkg.name}</h4>
                        <p className="text-sm text-slate-500 font-medium">{pkg.mapel}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : !selectedAnalyticsSchool ? (
              // Step 2: List Schools for the selected package
              <div className="animate-fade-in">
                <div className="flex items-center gap-4 mb-8">
                  <button className="bg-white border border-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm" onClick={() => setSelectedAnalyticsPackage(null)}>
                    <ChevronLeft size={20} />
                  </button>
                  <div>
                    <div className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Daftar Sekolah</div>
                    <h3 className="text-2xl font-bold text-slate-800 m-0">{selectedAnalyticsPackage.name}</h3>
                  </div>
                </div>

                {!packageAnalyticsData ? (
                  <div className="glass-panel p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-500">Memuat data sekolah...</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 opacity-5 text-blue-500"><Users size={80} /></div>
                        <div className="text-sm font-semibold text-slate-500 mb-1 uppercase tracking-wider text-center">Total Peserta</div>
                        <div className="text-4xl font-black text-slate-800">{packageAnalyticsData.summary?.totalParticipants || 0}</div>
                      </div>
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 opacity-5 text-indigo-500"><BarChart2 size={80} /></div>
                        <div className="text-sm font-semibold text-slate-500 mb-1 uppercase tracking-wider text-center">Rata-rata Nilai</div>
                        <div className="text-4xl font-black text-indigo-600">{packageAnalyticsData.summary?.average?.toFixed(1) || 0}</div>
                      </div>
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 opacity-5 text-green-500"><TrendingUp size={80} /></div>
                        <div className="text-sm font-semibold text-slate-500 mb-1 uppercase tracking-wider text-center">Nilai Tertinggi</div>
                        <div className="text-4xl font-black text-green-500">{packageAnalyticsData.summary?.highest?.toFixed(1) || 0}</div>
                      </div>
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 opacity-5 text-red-500"><AlertTriangle size={80} /></div>
                        <div className="text-sm font-semibold text-slate-500 mb-1 uppercase tracking-wider text-center">Nilai Terendah</div>
                        <div className="text-4xl font-black text-red-500">{packageAnalyticsData.summary?.lowest?.toFixed(1) || 0}</div>
                      </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                      <div className="bg-slate-50 p-4 border-b border-slate-200">
                        <h3 className="font-semibold text-slate-700 m-0">Distribusi per Sekolah</h3>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-white border-b border-slate-200">
                              <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">NPSN</th>
                              <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Sekolah</th>
                              <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Peserta</th>
                              <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rata-rata Sekolah</th>
                              <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {packageAnalyticsData.schools.map((sch: any) => (
                              <tr key={sch.npsn} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => handleSelectAnalyticsSchool(sch)}>
                                <td className="p-4 text-sm text-slate-500">{sch.npsn}</td>
                                <td className="p-4 text-sm font-bold text-slate-800">{sch.name}</td>
                                <td className="p-4 text-sm text-slate-600">
                                  <div className="flex items-center gap-2">
                                    <Users size={16} className="text-slate-400" />
                                    {sch.participantCount} Siswa
                                  </div>
                                </td>
                                <td className="p-4">
                                  <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-bold rounded-full bg-indigo-100 text-indigo-700">
                                    {sch.averageScore?.toFixed(1)}
                                  </span>
                                </td>
                                <td className="p-4 text-right">
                                  <button className="text-blue-500 font-medium text-sm group-hover:underline flex items-center gap-1 justify-end w-full">
                                    Lihat Siswa <ChevronRight size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Step 3: List Students for the selected school
              <div className="animate-fade-in">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                  <div className="flex items-start gap-4">
                    <button className="bg-white border border-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm mt-1" onClick={() => setSelectedAnalyticsSchool(null)}>
                      <ChevronLeft size={20} />
                    </button>
                    <div>
                      <div className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">{selectedAnalyticsPackage.name}</div>
                      <h3 className="text-2xl font-bold text-slate-800 m-0">{selectedAnalyticsSchool.name}</h3>
                      <div className="text-sm text-slate-500 mt-1">NPSN: {selectedAnalyticsSchool.npsn}</div>
                    </div>
                  </div>
                  <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium py-2 px-4 rounded-lg flex items-center gap-2 shadow-sm transition-all active:scale-95" onClick={() => {
                    const header = "NISN,Nama Siswa,Skor Total,Waktu Selesai\\n";
                    const csv = schoolStudentsData.map((a: any) => \`\${a.nisn},"\${a.studentName}",\${a.score},\${a.endTime}\`).join('\\n');
                    const blob = new Blob([header + csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`analitik_\${selectedAnalyticsSchool.npsn}.csv\`;
                    a.click();
                  }}>
                    <Download size={18} /> Unduh CSV Sekolah
                  </button>
                </div>

                <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                  {schoolStudentsData.length === 0 ? (
                    <div className="p-12 flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-slate-500">Memuat data siswa...</p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Peserta Didik</th>
                            <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Skor Akhir</th>
                            <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Penguasaan Elemen</th>
                            <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Tindakan</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {schoolStudentsData.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-4">
                                <div className="font-bold text-slate-800 text-sm">{item.studentName}</div>
                                <div className="text-slate-500 text-xs mt-1 font-mono">{item.nisn}</div>
                              </td>
                              <td className="p-4">
                                <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-bold rounded bg-blue-500 text-white shadow-sm">
                                  {Math.round(item.score || 0)}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col gap-2 max-w-sm">
                                  {Object.keys(item.elementBreakdown || {}).map(el => {
                                    const stat = item.elementBreakdown[el];
                                    const pct = (stat.correct / stat.total) * 100;
                                    return (
                                      <div key={el} className="flex items-center gap-3">
                                        <div className="w-24 text-xs text-slate-600 truncate" title={el}>{el}</div>
                                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                          <div className={\`h-full rounded-full \${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}\`} style={{ width: \`\${pct}%\` }}></div>
                                        </div>
                                        <div className="w-8 text-right text-xs font-semibold text-slate-600">{stat.correct}/{stat.total}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <button 
                                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors focus:ring-2 focus:ring-blue-300 outline-none"
                                  onClick={() => setSelectedSessionId(item.sessionId)}
                                >
                                  <Eye size={16} /> Laporan Detail
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Modal Detail Analisis */}
            {selectedSessionId && (
              <AnalysisDetailModal 
                sessionId={selectedSessionId} 
                onClose={() => setSelectedSessionId(null)} 
              />
            )}
          </div>
        )}

        {/* Placeholder for other tabs */}`;

content = content.replace(oldUIRegex, newUIBlock);

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Successfully replaced the file content with premium UI.");

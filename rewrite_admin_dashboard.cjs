const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'AdminDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace 1: States
content = content.replace(
  /const \[analytics, setAnalytics\] = useState<any\[\]>\(\[\]\);/,
  `// Analytics State
  const [analyticsPackages, setAnalyticsPackages] = useState<any[]>([]);
  const [selectedAnalyticsPackage, setSelectedAnalyticsPackage] = useState<any>(null);
  const [packageAnalyticsData, setPackageAnalyticsData] = useState<any>(null);
  const [selectedAnalyticsSchool, setSelectedAnalyticsSchool] = useState<any>(null);
  const [schoolStudentsData, setSchoolStudentsData] = useState<any[]>([]);`
);

// Replace 2: useEffect and Handlers
content = content.replace(
  /\} else if \(activeTab === 'results'\) \{\s+fetch\('\/api\/analytics'\)\s+\.then\(res => res\.json\(\)\)\s+\.then\(data => setAnalytics\(data\)\)\s+\.catch\(err => console\.error\("Error fetching analytics:", err\)\);\s+\}\s+\}, \[activeTab\]\);/,
  `} else if (activeTab === 'results') {
      fetch('/api/analytics/packages')
        .then(res => res.json())
        .then(data => setAnalyticsPackages(data))
        .catch(err => console.error("Error fetching analytics packages:", err));
    }
  }, [activeTab]);

  const handleSelectAnalyticsPackage = (pkg: any) => {
    setSelectedAnalyticsPackage(pkg);
    setSelectedAnalyticsSchool(null);
    setPackageAnalyticsData(null);
    fetch(\`/api/analytics/packages/\${pkg.id}\`)
      .then(res => res.json())
      .then(data => setPackageAnalyticsData(data))
      .catch(err => console.error(err));
  };

  const handleSelectAnalyticsSchool = (school: any) => {
    setSelectedAnalyticsSchool(school);
    setSchoolStudentsData([]);
    fetch(\`/api/analytics/packages/\${selectedAnalyticsPackage.id}/schools/\${school.npsn}\`)
      .then(res => res.json())
      .then(data => setSchoolStudentsData(data))
      .catch(err => console.error(err));
  };`
);

// Replace 3: The huge UI block for Results
const oldUIBlockStart = `{activeTab === 'results' && (`;
const oldUIBlockEnd = `          </div>\n        )}\n\n        {/* Placeholder for other tabs */}`;
const oldUIRegex = new RegExp(oldUIBlockStart.replace(/[.*+?^$\{}[\]\(\)]/g, '\\$&') + '[\\s\\S]*?' + oldUIBlockEnd.replace(/[.*+?^$\{}[\]\(\)]/g, '\\$&'));

const newUIBlock = `{activeTab === 'results' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Analitik Hasil Try Out</h2>
                <p className="text-muted">Data performa berdasarkan hirarki Paket &rarr; Sekolah &rarr; Siswa.</p>
              </div>
            </div>
            
            {!selectedAnalyticsPackage ? (
              // Step 1: List Packages
              <div className="glass-panel">
                <h3 className="mb-4 text-lg font-semibold border-b pb-2">Pilih Paket Ujian</h3>
                {analyticsPackages.length === 0 ? (
                  <div className="p-8 text-center text-muted">Belum ada paket dengan sesi selesai.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analyticsPackages.map(pkg => (
                      <div key={pkg.id} className="p-4 border border-slate-200 rounded-lg hover:border-blue-500 cursor-pointer transition-colors" onClick={() => handleSelectAnalyticsPackage(pkg)}>
                        <div className="font-semibold text-lg text-slate-800">{pkg.name}</div>
                        <div className="text-sm text-slate-500 mt-1">Mata Pelajaran: {pkg.mapel}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : !selectedAnalyticsSchool ? (
              // Step 2: List Schools for the selected package
              <div className="animate-fade-in">
                <div className="mb-6 flex items-center gap-3">
                  <button className="btn btn-outline" onClick={() => setSelectedAnalyticsPackage(null)}>
                    &larr; Kembali ke Daftar Paket
                  </button>
                  <h3 className="text-lg font-bold m-0">Paket: {selectedAnalyticsPackage.name}</h3>
                </div>

                {!packageAnalyticsData ? (
                  <div className="glass-panel p-8 text-center animate-pulse">Memuat data sekolah...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Total Peserta</div>
                        <div className="text-2xl font-bold text-blue-600">{packageAnalyticsData.summary?.totalParticipants || 0}</div>
                      </div>
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Rata-rata Nilai</div>
                        <div className="text-2xl font-bold text-slate-700">{packageAnalyticsData.summary?.average?.toFixed(1) || 0}</div>
                      </div>
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Nilai Tertinggi</div>
                        <div className="text-2xl font-bold text-green-600">{packageAnalyticsData.summary?.highest?.toFixed(1) || 0}</div>
                      </div>
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Nilai Terendah</div>
                        <div className="text-2xl font-bold text-red-600">{packageAnalyticsData.summary?.lowest?.toFixed(1) || 0}</div>
                      </div>
                    </div>

                    <div className="glass-panel">
                      <h3 className="mb-4 text-lg font-semibold border-b pb-2">Daftar Sekolah Peserta</h3>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>NPSN</th>
                            <th>Nama Sekolah</th>
                            <th>Jumlah Peserta</th>
                            <th>Rata-rata Sekolah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {packageAnalyticsData.schools.map((sch: any) => (
                            <tr key={sch.npsn} onClick={() => handleSelectAnalyticsSchool(sch)} style={{ cursor: 'pointer' }} className="hover:bg-slate-50">
                              <td>{sch.npsn}</td>
                              <td className="font-semibold">{sch.name}</td>
                              <td>{sch.participantCount} Siswa</td>
                              <td>
                                <span className="tag" style={{ background: 'var(--primary-color)', color: 'white' }}>
                                  {sch.averageScore?.toFixed(1)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Step 3: List Students for the selected school
              <div className="animate-fade-in">
                <div className="mb-6 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <button className="btn btn-outline" onClick={() => setSelectedAnalyticsSchool(null)}>
                      &larr; Kembali ke Daftar Sekolah
                    </button>
                    <div>
                      <h3 className="text-lg font-bold m-0">{selectedAnalyticsSchool.name}</h3>
                      <div className="text-sm text-slate-500">Paket: {selectedAnalyticsPackage.name}</div>
                    </div>
                  </div>
                  <button className="btn flex items-center gap-2" onClick={() => {
                    const header = "NISN,Nama Siswa,Skor Total,Waktu Selesai\\n";
                    const csv = schoolStudentsData.map((a: any) => \`\${a.nisn},"\${a.studentName}",\${a.score},\${a.endTime}\`).join('\\n');
                    const blob = new Blob([header + csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`analitik_\${selectedAnalyticsSchool.npsn}.csv\`;
                    a.click();
                  }}>
                    <Download size={18} /> Ekspor CSV Sekolah
                  </button>
                </div>

                <div className="glass-panel" style={{ overflowX: 'auto' }}>
                  {schoolStudentsData.length === 0 ? (
                    <div className="p-8 text-center animate-pulse">Memuat data siswa...</div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Nama Siswa / NISN</th>
                          <th>Total Skor</th>
                          <th>Analisis per Elemen</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schoolStudentsData.map((item: any, idx: number) => (
                          <tr key={idx}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.studentName}</div>
                              <div className="text-muted" style={{ fontSize: '0.85rem' }}>{item.nisn}</div>
                            </td>
                            <td>
                              <span className="tag" style={{ background: 'var(--primary-color)', color: 'white' }}>
                                {Math.round(item.score || 0)}
                              </span>
                            </td>
                            <td>
                              <div className="flex flex-col gap-1">
                                {Object.keys(item.elementBreakdown || {}).map(el => (
                                  <div key={el} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', maxWidth: '300px', borderBottom: '1px solid #f1f5f9', paddingBottom: '2px' }}>
                                    <span>{el}:</span>
                                    <strong>{item.elementBreakdown[el].correct} / {item.elementBreakdown[el].total}</strong>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td>
                              <button 
                                className="btn btn-outline" 
                                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => setSelectedSessionId(item.sessionId)}
                              >
                                <Eye size={16} /> Lihat Detail
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
console.log("Successfully replaced the file content.");

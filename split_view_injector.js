const fs = require('fs')
const file = '/Users/brizzi/IrrigaAgro/irrigaagro-v2/src/app/(app)/precipitacoes/page.tsx'

let content = fs.readFileSync(file, 'utf8')

// 1. Add `isCompare` state
content = content.replace(
  'const [month, setMonth] = useState(today.getMonth())',
  `const [month, setMonth] = useState(today.getMonth())
  const [isCompare, setIsCompare] = useState(false)
  const [comparePivotId, setComparePivotId] = useState<string>('')
  const [compareYear, setCompareYear] = useState(today.getFullYear())
  const [compareMonth, setCompareMonth] = useState(today.getMonth())
  const [compareAllRecords, setCompareAllRecords] = useState<RainfallRecord[]>([])
  const [loadingCompare, setLoadingCompare] = useState(false)
`
)

// 2. Add compare options
content = content.replace(
  'setPivotId(current => {',
  `setPivotId(current => {
          if (current && options.some(p => p.id === current)) return current
          return options[0]?.id ?? ''
        })
        setComparePivotId(current => {`
)

content = content.replace(
  'loadRecords(pivotId, year)',
  `loadRecords(pivotId, year)
    } else {
      setAllRecords([])
      setEditModal(null)
      setShowImport(false)
    }
  }, [pivotId, year, loadRecords])

  useEffect(() => {
    if (isCompare && comparePivotId) {
      setLoadingCompare(true)
      listRainfallByPivotIds([comparePivotId])
        .then(data => {
          setCompareAllRecords(
            data
              .filter(r => r.date >= \`\${compareYear}-01-01\` && r.date <= \`\${compareYear}-12-31\`)
              .sort((a, b) => a.date.localeCompare(b.date))
          )
        })
        .finally(() => setLoadingCompare(false))
    } else {
      setCompareAllRecords([])
    }
  }, [isCompare, comparePivotId, compareYear])

  // Ignorar block duplicate
  useEffect(() => {
    if (false) {`
)

// Add the original if (pivotId) content so it compiles correctly.
// Oh wait, my string replace logic above is too fragile.

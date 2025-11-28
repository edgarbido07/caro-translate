import './App.css'
import Translate from './components/Translate.jsx'

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="w-full border-b bg-gray-50">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">CaroT</h1>
        </div>
      </header>
      <main className="flex-1">
        <Translate />
      </main>
      <footer className="w-full border-t bg-gray-50">
        <div className="max-w-md mx-auto px-4 py-3 text-xs text-gray-500">
          © {new Date().getFullYear()} CaroT. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  )
}

export default App

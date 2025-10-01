'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Circle, Minimize2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface CourseCreationProgressProps {
  courseId: number
  courseName: string
  onComplete: () => void
  onMinimize: () => void
}

interface StatusStep {
  key: string
  label: string
  status: 'pending' | 'active' | 'complete'
}

export function CourseCreationProgress({ courseId, courseName, onComplete, onMinimize }: CourseCreationProgressProps) {
  const [currentStatus, setCurrentStatus] = useState<string>('uploading')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [progress, setProgress] = useState<number>(0)

  const steps: StatusStep[] = [
    { key: 'uploading', label: 'Uploading PDF', status: 'pending' },
    { key: 'extracting_pages', label: 'Extracting page content', status: 'pending' },
    { key: 'extracting_toc', label: 'Extracting table of contents', status: 'pending' },
    { key: 'extracting_headers', label: 'Analyzing document structure', status: 'pending' },
    { key: 'ai_processing', label: 'Generating syllabus with AI', status: 'pending' },
    { key: 'creating_readings', label: 'Creating reading sections', status: 'pending' },
    { key: 'complete', label: 'Complete', status: 'pending' },
  ]

  // Update step statuses based on current status
  const getStepStatuses = () => {
    return steps.map(step => {
      const currentIndex = steps.findIndex(s => s.key === currentStatus)
      const stepIndex = steps.findIndex(s => s.key === step.key)

      if (stepIndex < currentIndex) return { ...step, status: 'complete' as const }
      if (stepIndex === currentIndex) return { ...step, status: 'active' as const }
      return step
    })
  }

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}/status`, {
          credentials: 'include'
        })

        if (res.ok) {
          const data = await res.json()
          setCurrentStatus(data.status)
          setStatusMessage(data.status_message || '')
          setProgress(data.progress_percent || 0)

          if (data.status === 'complete') {
            setTimeout(() => {
              onComplete()
            }, 1000) // Show complete state for 1 second
          }
        }
      } catch (error) {
        console.error('Failed to fetch course status:', error)
      }
    }

    // Poll every 500ms
    const interval = setInterval(pollStatus, 500)
    pollStatus() // Initial call

    return () => clearInterval(interval)
  }, [courseId, onComplete])

  const updatedSteps = getStepStatuses()

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Creating: {courseName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onMinimize}
              className="h-8 w-8 p-0"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {updatedSteps.map((step) => (
            <div key={step.key} className="flex items-start gap-3">
              <div className="mt-0.5">
                {step.status === 'complete' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : step.status === 'active' ? (
                  <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm ${step.status === 'active' ? 'font-medium' : ''}`}>
                  {step.label}
                </p>
                {step.status === 'active' && statusMessage && (
                  <p className="text-xs text-gray-500 mt-0.5">{statusMessage}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-center mt-1">{progress}%</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

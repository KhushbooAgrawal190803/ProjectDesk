import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/get-user'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileArchive, FileText } from 'lucide-react'

export default async function DownloadsPage() {
  const profile = await requireProfile()
  if (!profile) {
    redirect('/login')
  }

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Bulk Downloads</h1>
          <p className="text-zinc-600 mt-1">Download booking documents in bulk</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Company Copies</CardTitle>
                  <CardDescription className="mt-1">
                    All company PDF copies
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full gap-2" disabled>
                <Download className="w-4 h-4" />
                Download All Company PDFs
              </Button>
              <p className="text-xs text-zinc-500 text-center mt-3">
                PDF generation coming soon
              </p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <CardTitle>Customer Copies</CardTitle>
                  <CardDescription className="mt-1">
                    All customer acknowledgements
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full gap-2" disabled>
                <Download className="w-4 h-4" />
                Download All Customer PDFs
              </Button>
              <p className="text-xs text-zinc-500 text-center mt-3">
                PDF generation coming soon
              </p>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm md:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileArchive className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle>Filtered Archive</CardTitle>
                  <CardDescription className="mt-1">
                    Download PDFs for filtered bookings from the registry
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 mb-4">
                Use the filters on the All Bookings page, then return here to download only the filtered results.
              </p>
              <Button className="w-full gap-2" disabled>
                <FileArchive className="w-4 h-4" />
                Download Filtered Results
              </Button>
              <p className="text-xs text-zinc-500 text-center mt-3">
                Feature coming soon
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-zinc-200 shadow-sm bg-blue-50 border-blue-200">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 mb-1">Note about PDF Generation</p>
                <p className="text-sm text-blue-700">
                  PDF generation functionality will be implemented after the database and UI are complete. 
                  For now, you can view all booking details in the system and access individual booking pages.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}


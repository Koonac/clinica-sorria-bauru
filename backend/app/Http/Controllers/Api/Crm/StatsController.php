<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Crm\Lead;
use App\Services\Crm\GetAttendanceStats;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StatsController extends Controller
{
    /** Série diária de leads criados (preenche dias sem entrada com zero). */
    public function leadsPorDia(Request $request): JsonResponse
    {
        $dados = $request->validate([
            'dias' => ['sometimes', 'integer', 'min:7', 'max:90'],
        ]);

        $dias = (int) ($dados['dias'] ?? 30);
        $tz = config('app.timezone') ?: 'UTC';
        $inicio = Carbon::now($tz)->subDays($dias - 1)->startOfDay();

        $contagens = Lead::query()
            ->where('created_at', '>=', $inicio->copy()->utc())
            ->get(['created_at'])
            ->countBy(fn (Lead $lead) => $lead->created_at->timezone($tz)->toDateString());

        $serie = [];
        for ($i = 0; $i < $dias; $i++) {
            $dia = $inicio->copy()->addDays($i)->toDateString();
            $serie[] = [
                'date' => $dia,
                'total' => (int) ($contagens[$dia] ?? 0),
            ];
        }

        return response()->json([
            'data' => $serie,
            'dias' => $dias,
            'total' => array_sum(array_column($serie, 'total')),
        ]);
    }

    public function attendance(Request $request, GetAttendanceStats $stats): JsonResponse
    {
        $dados = $request->validate([
            'dias' => ['sometimes', 'integer', 'min:7', 'max:90'],
        ]);

        return response()->json([
            'data' => $stats->handle((int) ($dados['dias'] ?? 30)),
        ]);
    }
}

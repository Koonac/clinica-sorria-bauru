<?php

namespace App\Http\Middleware;

use App\Models\Clinic;
use App\Models\User;
use App\Support\ClinicContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveClinicContext
{
    public function __construct(private ClinicContext $clinicContext) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        // Admin e funcionário: clínica fixa; só developer usa X-Clinic-Id.
        if ($user->isClinicScoped()) {
            if (! $user->clinic_id) {
                return response()->json(['message' => 'Usuário sem clínica vinculada.'], 403);
            }

            $clinic = Clinic::query()->whereKey($user->clinic_id)->where('is_active', true)->first();
            if (! $clinic) {
                return response()->json(['message' => 'Clínica do usuário não encontrada ou inativa.'], 403);
            }

            $this->clinicContext->set($clinic);
            $request->attributes->set('clinic', $clinic);

            return $next($request);
        }

        $headerId = $request->header('X-Clinic-Id');
        $clinic = null;

        if (filled($headerId)) {
            $clinic = Clinic::query()->whereKey((int) $headerId)->where('is_active', true)->first();
            if (! $clinic) {
                return response()->json(['message' => 'Clínica inválida ou inativa.'], 422);
            }
        } else {
            $clinic = Clinic::query()->where('is_active', true)->orderBy('id')->first();
            if (! $clinic) {
                return response()->json(['message' => 'Nenhuma clínica ativa disponível.'], 422);
            }
        }

        $this->clinicContext->set($clinic);
        $request->attributes->set('clinic', $clinic);

        return $next($request);
    }
}

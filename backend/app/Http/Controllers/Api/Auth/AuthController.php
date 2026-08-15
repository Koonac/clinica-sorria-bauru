<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        /** @var User|null $user */
        $user = User::query()
            ->whereRaw('LOWER(username) = ?', [mb_strtolower($credentials['user'])])
            ->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'user' => ['Credenciais inválidas.'],
            ]);
        }

        $deviceName = $credentials['device_name'] ?? 'spa';
        $token = $user->createToken($deviceName)->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->toAuthArray(),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $request->user()->toAuthArray(),
        ]);
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Senha atual incorreta.'],
            ]);
        }

        $user->forceFill(['password' => $data['password']])->save();

        // Invalida outras sessões web; mantém o token atual e o de serviço.
        $current = $user->currentAccessToken();
        $user->tokens()
            ->where('name', '!=', 'interface')
            ->when(
                $current instanceof PersonalAccessToken,
                fn ($q) => $q->whereKeyNot($current->id),
            )
            ->delete();

        return response()->json(['message' => 'Senha alterada com sucesso.']);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        return response()->json(['message' => 'Sessão encerrada.']);
    }

    public function logoutAll(Request $request): JsonResponse
    {
        $user = $request->user();

        // Mantém o token de serviço da interface Vekta, se existir.
        $user?->tokens()->where('name', '!=', 'interface')->delete();

        return response()->json(['message' => 'Todas as sessões web foram encerradas.']);
    }
}

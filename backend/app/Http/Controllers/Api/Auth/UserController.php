<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\StoreUserRequest;
use App\Http\Requests\Auth\UpdateUserRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()->orderBy('name');

        if ($role = $request->query('role')) {
            $query->where('role', $role);
        }

        if ($search = trim((string) $request->query('search'))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->whereLike('name', $like, caseSensitive: false)
                    ->orWhereLike('username', $like, caseSensitive: false)
                    ->orWhereLike('email', $like, caseSensitive: false);
            });
        }

        $users = $query->paginate(50)->through(fn (User $user) => $user->toAuthArray());

        return response()->json($users);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = User::query()->create($request->validated());

        return response()->json(['data' => $user->toAuthArray()], 201);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(['data' => $user->toAuthArray()]);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $data = $request->validated();

        if (
            isset($data['role'])
            && $data['role'] !== User::ROLE_ADMIN
            && $user->role === User::ROLE_ADMIN
        ) {
            if ($this->ehUltimoAdmin($user)) {
                return response()->json([
                    'message' => 'Não é possível remover o papel de admin do último administrador.',
                ], 422);
            }
        }

        $user->fill($data)->save();

        return response()->json(['data' => $user->fresh()->toAuthArray()]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($request->user()?->is($user)) {
            return response()->json([
                'message' => 'Você não pode excluir a própria conta.',
            ], 422);
        }

        if ($user->role === User::ROLE_ADMIN && $this->ehUltimoAdmin($user)) {
            return response()->json([
                'message' => 'Não é possível excluir o último administrador.',
            ], 422);
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Usuário removido.']);
    }

    private function ehUltimoAdmin(User $user): bool
    {
        return User::query()
            ->where('role', User::ROLE_ADMIN)
            ->whereKeyNot($user->id)
            ->doesntExist();
    }
}

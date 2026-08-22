<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\StoreUserRequest;
use App\Http\Requests\Auth\UpdateUserRequest;
use App\Models\User;
use App\Services\Auth\AssertUserAccessible;
use App\Services\Auth\CreateUser;
use App\Services\Auth\DeleteUser;
use App\Services\Auth\ListUsers;
use App\Services\Auth\UpdateUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request, ListUsers $list): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $users = $list->handle($request, $actor);

        return response()->json($users);
    }

    public function store(StoreUserRequest $request, CreateUser $create): JsonResponse
    {
        $user = $create->handle($request->validated());

        return response()->json(['data' => $user->toAuthArray()], 201);
    }

    public function show(Request $request, User $user, AssertUserAccessible $assert): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $assert->handle($actor, $user);

        return response()->json(['data' => $user->toAuthArray()]);
    }

    public function update(UpdateUserRequest $request, User $user, UpdateUser $update): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $updated = $update->handle($actor, $user, $request->validated());

        return response()->json(['data' => $updated->toAuthArray()]);
    }

    public function destroy(Request $request, User $user, DeleteUser $delete): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $delete->handle($actor, $user);

        return response()->json(['message' => 'Usuário removido.']);
    }
}

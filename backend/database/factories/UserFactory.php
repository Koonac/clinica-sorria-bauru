<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'username' => fake()->unique()->userName().fake()->numberBetween(10, 99),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => User::ROLE_ADMIN,
            'clinic_id' => null,
            'remember_token' => Str::random(10),
        ];
    }

    public function admin(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => User::ROLE_ADMIN,
            'clinic_id' => null,
        ]);
    }

    public function developer(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => User::ROLE_DEVELOPER,
            'clinic_id' => null,
        ]);
    }

    public function funcionario(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => User::ROLE_FUNCIONARIO,
        ]);
    }

    public function forClinic(int $clinicId): static
    {
        return $this->state(fn (array $attributes) => [
            'clinic_id' => $clinicId,
        ]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}

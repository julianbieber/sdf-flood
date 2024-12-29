#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
    float fft;
    float padding2;
    float padding3;
} u;

layout (binding  = 1) readonly buffer SliderParameters{
    float v[];
} sliders;

layout(binding = 2) readonly buffer eyeBuffer {
    float v[];
} eyes;

#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0
#define E 2.71828182846

// Parameters for ray marching
const int MAX_STEPS = 64;
const float STEP_SIZE = 0.1;
const float DENSITY_THRESHOLD = 0.1;

const vec3 lightDir = vec3(0.0, -1.0, 1.0);

float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}

// Function to generate hash-based pseudo-random numbers
float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.1, 0.1));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

const mat3 OKLAB2RGB_A = mat3(
        1.0, 1.0, 1.0,
        0.3963377774, -0.1055613458, -0.0894841775,
        0.2158037573, -0.0638541728, -1.2914855480);

const mat3 OKLAB2RGB_B = mat3(
        4.0767416621, -1.2684380046, -0.0041960863,
        -3.3077115913, 2.6097574011, -0.7034186147,
        0.2309699292, -0.3413193965, 1.7076147010);

vec3 oklab2rgb(vec3 oklab) {
    vec3 lms = OKLAB2RGB_A * oklab;
    return OKLAB2RGB_B * (lms * lms * lms);
}
vec4 oklab2rgb(vec4 oklab) {
    return vec4(oklab2rgb(oklab.xyz), oklab.a);
}

// Simple noise function
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f); // Smoothstep interpolation

    float n000 = hash(i + vec3(0, 0, 0));
    float n100 = hash(i + vec3(1, 0, 0));
    float n010 = hash(i + vec3(0, 1, 0));
    float n110 = hash(i + vec3(1, 1, 0));
    float n001 = hash(i + vec3(0, 0, 1));
    float n101 = hash(i + vec3(1, 0, 1));
    float n011 = hash(i + vec3(0, 1, 1));
    float n111 = hash(i + vec3(1, 1, 1));

    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}

// Fractal Brownian Motion (FBM) for complex noise
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = u.fft / 44100.0;

    for (int i = 0; i < 5; i++) { // Use multiple octaves
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }

    return value;
}

int to_vec_position(ivec2 p) {
    int x = p.x;
    int y = p.y;

    if (x < 0 || y < 0) {
        return -1;
    }
    if (x >= 705 || y >= 705) {
        return -1;
    }

    int i = (x + y) %  705; // times two to skip cos

    return i;
}

float densityFunction(vec3 p) {
    return fbm(p) * 0.2;
}

// Henyey-Greenstein phase function
float henyeyGreenstein(float g, float cosTheta) {
    float g2 = g * g;
    return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
}

ivec2 discretize_p(vec3 p) {
    vec2 d = p.xz;
    // d.x * 30.0;
    // d.y += 704.0 / 2.0;
    return ivec2(d);
}

vec3 density_normal(vec3 p) {
    const float EPSILON = 0.0002;
    return normalize(vec3(
            densityFunction(vec3(p.x + EPSILON, p.y, p.z)) - densityFunction(vec3(p.x - EPSILON, p.y, p.z)),
            densityFunction(vec3(p.x, p.y + EPSILON, p.z)) - densityFunction(vec3(p.x, p.y - EPSILON, p.z)),
            densityFunction(vec3(p.x, p.y, p.z + EPSILON)) - densityFunction(vec3(p.x, p.y, p.z - EPSILON))
        ));
}
vec3 moveInCircle3D(float angle, float radius, vec3 axis) {
    vec3 u = normalize(axis);
    vec3 v = normalize(cross(u, vec3(0.0, 1.0, 0.0)));
    vec3 w = cross(u, v);
    return radius * (cos(angle) * v + sin(angle) * w);
}
// Ray marching with advanced light scattering
vec4 rayMarch(vec3 ro, vec3 rd) {
    float t = 0.001;
    vec4 accumulatedColor = vec4(0.0);
    float transmittance = 1.0;
    float density_sum = 0.0;
    float first_hit_t = 100000000.0;
    float offset_sum = 0.0;

    for (int i = 0; i < 32; i++) {
        vec3 pos = ro + t * rd;
        float density = (densityFunction(pos)) * 0.8;

        density_sum += density;
        if (density_sum > DENSITY_THRESHOLD) {
            if (first_hit_t > t) {
                first_hit_t = t;
            }
        }
    }
    // vec3 first_hit_pos = ro + (first_hit_t + offset_sum) * rd;
    // vec3 normal = density_normal(first_hit_pos);

    // vec3 light_dir = moveInCircle3D(u.time, 1.0, vec3(1.0, sin(fft.v[0]), 1.0));
    // float light_angle = min(max(dot(light_dir, normal), 0.2), 0.4) * 0.2;

    vec3 c = oklab2rgb(vec3(mix(0.715, 0.9, 1.0 - density_sum), -0.057, -0.059));

    return vec4(c, 1.0);
}

vec4 render(vec3 eye, vec3 ray) {
    vec4 cloudColor = rayMarch(eye, ray);
    return pow(cloudColor, vec4(1.0 / 2.2));
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position * 4.0, 1.0));

    out_color = render(vec3(0.0, 0.0, 0.0) + ray_direction * u.time, ray_direction);
}
// void main2() {
//     vec2 pixel_position = uv * 705;
//     ivec2 pos = ivec2(pixel_position.x, pixel_position.y);
//     int i = to_vec_position(pos);
//     float v = fft.v[pos.x] * 1.0;

//     out_color = vec4(v);
//     // out_color = vec4(densityFunction(ivec2(0.0, pos.y), 0.0));
// }
